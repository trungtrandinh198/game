import {
  SurfaceMap,
  createCollisionWorld,
  type CollisionWorld,
  type Segment,
  type SandboxWorld,
} from "@dnw/game-core";
import { COLLISION_CELL_SIZE_M, type SurfaceKind } from "@dnw/game-config";
import type { ZoneIndex } from "@dnw/schemas";

/** Phần của thế giới mà dự đoán phía client cần (cùng hình dạng với SandboxWorld). */
export type SimulationWorld = Pick<SandboxWorld, "collision" | "inBounds" | "surfaceAt">;

interface ChunkEntry {
  collision: CollisionWorld;
}

/**
 * Thế giới mô phỏng gộp từ các chunk đang nạp: va chạm theo từng chunk, bề mặt qua `SurfaceMap`.
 * Vùng chưa nạp coi như trống (server vẫn là nguồn sự thật và sẽ hiệu chỉnh).
 */
export class StreamingWorld implements SimulationWorld {
  readonly collision: CollisionWorld;
  readonly surfaces: SurfaceMap;
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly size: number;
  private readonly bounds: ZoneIndex["bounds"];

  constructor(index: Pick<ZoneIndex, "chunkSizeM" | "bounds">) {
    this.size = index.chunkSizeM;
    this.bounds = index.bounds;
    this.surfaces = new SurfaceMap(index.chunkSizeM);
    const chunks = this.chunks;
    const size = this.size;
    this.collision = {
      querySegments(x, z, radius) {
        const out: Segment[] = [];
        const minGx = Math.floor((x - radius) / size);
        const maxGx = Math.floor((x + radius) / size);
        const minGz = Math.floor((z - radius) / size);
        const maxGz = Math.floor((z + radius) / size);
        for (let gx = minGx; gx <= maxGx; gx++) {
          for (let gz = minGz; gz <= maxGz; gz++) {
            const entry = chunks.get(`${gx}_${gz}`);
            if (entry) out.push(...entry.collision.querySegments(x, z, radius));
          }
        }
        return out;
      },
    };
  }

  inBounds = (x: number, z: number): boolean =>
    x >= this.bounds.minX && x <= this.bounds.maxX && z >= this.bounds.minZ && z <= this.bounds.maxZ;

  surfaceAt = (x: number, z: number): SurfaceKind => this.surfaces.surfaceAt(x, z);

  add(
    gx: number,
    gz: number,
    data: { segments: Float32Array; surface: Parameters<SurfaceMap["set"]>[2] },
  ): void {
    const segments: Segment[] = [];
    for (let i = 0; i + 3 < data.segments.length; i += 4) {
      segments.push([
        data.segments[i]!,
        data.segments[i + 1]!,
        data.segments[i + 2]!,
        data.segments[i + 3]!,
      ]);
    }
    this.chunks.set(`${gx}_${gz}`, { collision: createCollisionWorld(segments, COLLISION_CELL_SIZE_M) });
    this.surfaces.set(gx, gz, data.surface);
  }

  remove(gx: number, gz: number): void {
    this.chunks.delete(`${gx}_${gz}`);
    this.surfaces.delete(gx, gz);
  }

  has(gx: number, gz: number): boolean {
    return this.chunks.has(`${gx}_${gz}`);
  }
}
