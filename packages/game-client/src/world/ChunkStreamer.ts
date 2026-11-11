import type { ZoneIndex } from "@dnw/schemas";
import * as THREE from "three";
import { disposeChunk, type ChunkLoader, type LoadedChunk } from "./ChunkLoader";
import { StreamingWorld } from "./StreamingWorld";

type IndexEntry = ZoneIndex["chunks"][number];

/** Khoảng nhìn trước theo hướng di chuyển để tải sớm (mục 16.10). */
const PREFETCH_M = 96;
/** Giữ chunk trong bán kính này (Chebyshev, theo ô chunk); xa hơn thì giải phóng. */
const KEEP_RADIUS = 2;
const RETRY_AFTER_MS = 3000;

export interface Heading {
  x: number;
  z: number;
}

/** Tập chunk cần có quanh (x, z): lưới 3 x 3 cộng chunk phía trước nếu đang di chuyển. */
export function desiredChunks(
  index: Pick<ZoneIndex, "chunkSizeM" | "chunks">,
  x: number,
  z: number,
  heading?: Heading,
): { needed: IndexEntry[]; keep: Set<string> } {
  const size = index.chunkSizeM;
  const cx = Math.floor(x / size);
  const cz = Math.floor(z / size);
  const byCell = new Map(index.chunks.map((c) => [`${c.gx}_${c.gz}`, c]));

  const needed: IndexEntry[] = [];
  const add = (gx: number, gz: number) => {
    const e = byCell.get(`${gx}_${gz}`);
    if (e && !needed.includes(e)) needed.push(e);
  };
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) add(cx + dx, cz + dz);

  const keep = new Set<string>();
  const ahead =
    heading && Math.hypot(heading.x, heading.z) > 0.01
      ? {
          gx: Math.floor((x + heading.x * PREFETCH_M) / size),
          gz: Math.floor((z + heading.z * PREFETCH_M) / size),
        }
      : null;
  if (ahead) {
    add(ahead.gx, ahead.gz);
    keep.add(`${ahead.gx}_${ahead.gz}`);
  }
  for (const e of index.chunks) {
    if (Math.max(Math.abs(e.gx - cx), Math.abs(e.gz - cz)) <= KEEP_RADIUS) keep.add(`${e.gx}_${e.gz}`);
  }
  return { needed, keep };
}

/**
 * Nạp/giải phóng chunk theo vị trí người chơi (mục 16.10): 3 x 3 quanh người chơi, tải trước theo hướng đi,
 * `dispose` chunk xa. Mức nạp đồng thời do `ChunkLoader` giới hạn.
 */
export class ChunkStreamer {
  readonly root = new THREE.Group();
  readonly world: StreamingWorld;
  private readonly loaded = new Map<string, { chunk: LoadedChunk; entry: IndexEntry }>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly failedAt = new Map<string, number>();
  private disposed = false;
  /** Số chunk đã nạp thành công từ lúc tạo (dùng cho thống kê/thử nghiệm). */
  totalLoaded = 0;
  totalDisposed = 0;

  constructor(
    private readonly loader: ChunkLoader,
    private readonly index: ZoneIndex,
  ) {
    this.root.name = "streamed-chunks";
    this.world = new StreamingWorld(index);
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  isLoaded(code: string): boolean {
    return this.loaded.has(code);
  }

  /** Gọi mỗi khung hình (rẻ): khởi chạy tải chunk thiếu và giải phóng chunk xa. */
  update(x: number, z: number, heading?: Heading): void {
    if (this.disposed) return;
    const { needed, keep } = desiredChunks(this.index, x, z, heading);
    const now = performance.now();
    for (const entry of needed) {
      if (this.loaded.has(entry.code) || this.loading.has(entry.code)) continue;
      if (now - (this.failedAt.get(entry.code) ?? -Infinity) < RETRY_AFTER_MS) continue;
      this.start(entry);
    }
    for (const [code, { chunk, entry }] of this.loaded) {
      if (keep.has(`${entry.gx}_${entry.gz}`)) continue;
      this.world.remove(entry.gx, entry.gz);
      disposeChunk(chunk);
      this.loaded.delete(code);
      this.totalDisposed++;
    }
  }

  /** Chờ đến khi mọi chunk của lưới 3 x 3 quanh (x, z) đã nạp; báo tiến độ 0..1. */
  async ensureAround(x: number, z: number, onProgress?: (ratio: number) => void): Promise<void> {
    const { needed } = desiredChunks(this.index, x, z);
    const total = Math.max(1, needed.length);
    onProgress?.(0);
    this.update(x, z);
    await Promise.all(
      needed.map(async (entry) => {
        await this.loading.get(entry.code);
        if (!this.loaded.has(entry.code)) {
          // Lần đầu lỗi: thử lại một lần ngay để màn loading không kẹt vì lỗi thoáng qua.
          this.failedAt.delete(entry.code);
          this.start(entry);
          await this.loading.get(entry.code);
        }
        if (!this.loaded.has(entry.code)) throw new Error(`Không tải được chunk ${entry.code}`);
        onProgress?.(
          Math.min(1, needed.filter((e) => this.loaded.has(e.code)).length / total),
        );
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const { chunk, entry } of this.loaded.values()) {
      this.world.remove(entry.gx, entry.gz);
      disposeChunk(chunk);
    }
    this.loaded.clear();
    this.root.removeFromParent();
  }

  private start(entry: IndexEntry): void {
    const task = this.loader
      .loadChunk(entry.code)
      .then((chunk) => {
        if (this.disposed) return disposeChunk(chunk);
        this.loaded.set(entry.code, { chunk, entry });
        this.world.add(entry.gx, entry.gz, chunk);
        this.root.add(chunk.group);
        this.totalLoaded++;
        this.failedAt.delete(entry.code);
      })
      .catch(() => {
        this.failedAt.set(entry.code, performance.now());
      })
      .finally(() => {
        this.loading.delete(entry.code);
      });
    this.loading.set(entry.code, task);
  }
}
