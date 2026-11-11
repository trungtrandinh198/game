import type { ZoneIndex } from "@dnw/schemas";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ChunkLoader, LoadedChunk } from "./ChunkLoader";
import { ChunkStreamer, desiredChunks } from "./ChunkStreamer";
import { StreamingWorld } from "./StreamingWorld";

const SIZE = 256;

function makeIndex(n = 6): Pick<ZoneIndex, "chunkSizeM" | "chunks" | "bounds"> & ZoneIndex {
  const chunks: ZoneIndex["chunks"] = [];
  for (let gx = 0; gx < n; gx++)
    for (let gz = 0; gz < n; gz++)
      chunks.push({
        code: `x${gx}_z${gz}`,
        gx,
        gz,
        manifest: `chunks/x${gx}_z${gz}/manifest.json`,
        sizeBytes: 1,
      } as ZoneIndex["chunks"][number]);
  return {
    schemaVersion: 1,
    zoneCode: "t",
    mapVersion: 1,
    chunkSizeM: SIZE,
    crs: "EPSG:32649",
    origin: { lon: 0, lat: 0 },
    bounds: { minX: 0, minZ: 0, maxX: n * SIZE, maxZ: n * SIZE },
    chunks,
  } as unknown as ZoneIndex & Pick<ZoneIndex, "chunkSizeM" | "chunks" | "bounds">;
}

function fakeChunk(code: string, segments: number[] = []): LoadedChunk {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  return {
    code,
    manifest: {} as LoadedChunk["manifest"],
    group,
    segments: new Float32Array(segments),
    surface: { cellSizeM: 4, width: 1, height: 1, data: new Uint8Array([2]) },
  };
}

describe("desiredChunks", () => {
  const index = makeIndex();

  it("lấy lưới 3 x 3 quanh người chơi", () => {
    const { needed } = desiredChunks(index, 2.5 * SIZE, 2.5 * SIZE);
    expect(needed.map((c) => c.code).sort()).toEqual(
      [1, 2, 3].flatMap((x) => [1, 2, 3].map((z) => `x${x}_z${z}`)).sort(),
    );
  });

  it("ở góc bản đồ chỉ lấy chunk có trong index", () => {
    expect(desiredChunks(index, 10, 10).needed).toHaveLength(4);
  });

  it("tải trước chunk phía trước theo hướng di chuyển", () => {
    const { needed } = desiredChunks(index, 2.5 * SIZE, 2.5 * SIZE, { x: 1, z: 0 });
    expect(needed.some((c) => c.gx === 3 && c.gz === 2)).toBe(true);
    // nhìn xa hơn 96 m sang chunk gx = 4 khi ở sát biên
    const edge = desiredChunks(index, 4 * SIZE - 10, 2.5 * SIZE, { x: 1, z: 0 });
    expect(edge.needed.some((c) => c.gx === 4)).toBe(true);
  });
});

describe("StreamingWorld", () => {
  it("gộp va chạm và bề mặt từ các chunk đã nạp, bỏ đi khi remove", () => {
    const world = new StreamingWorld(makeIndex());
    // vách dọc tại x = 300 trong chunk (1, 0)
    world.add(1, 0, { segments: new Float32Array([300, 0, 300, 100]), surface: fakeChunk("a").surface });
    expect(world.collision.querySegments(300, 50, 3)).toHaveLength(1);
    expect(world.collision.querySegments(10, 50, 3)).toHaveLength(0);
    expect(world.surfaceAt(SIZE + 1, 1)).toBe("road");
    world.remove(1, 0);
    expect(world.collision.querySegments(300, 50, 3)).toHaveLength(0);
    expect(world.surfaceAt(SIZE + 1, 1)).toBe("ground");
  });

  it("inBounds theo hộp của zone", () => {
    const world = new StreamingWorld(makeIndex());
    expect(world.inBounds(10, 10)).toBe(true);
    expect(world.inBounds(-1, 10)).toBe(false);
  });
});

describe("ChunkStreamer", () => {
  function setup() {
    const index = makeIndex();
    const calls: string[] = [];
    const loader = {
      loadChunk: async (code: string) => {
        calls.push(code);
        return fakeChunk(code);
      },
    } as unknown as ChunkLoader;
    return { streamer: new ChunkStreamer(loader, index), calls };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("ensureAround chờ đủ 3 x 3 và báo tiến độ đến 1", async () => {
    const { streamer } = setup();
    const ratios: number[] = [];
    await streamer.ensureAround(2.5 * SIZE, 2.5 * SIZE, (r) => ratios.push(r));
    expect(streamer.loadedCount).toBe(9);
    expect(ratios.at(-1)).toBe(1);
    expect(streamer.world.has(2, 2)).toBe(true);
  });

  it("đi xa thì giải phóng chunk cũ và không nạp trùng", async () => {
    const { streamer, calls } = setup();
    await streamer.ensureAround(0.5 * SIZE, 0.5 * SIZE);
    const first = [...calls];
    streamer.update(0.5 * SIZE, 0.5 * SIZE);
    await flush();
    expect(calls).toEqual(first);

    streamer.update(5.5 * SIZE, 5.5 * SIZE);
    await flush();
    streamer.update(5.5 * SIZE, 5.5 * SIZE);
    expect(streamer.isLoaded("x0_z0")).toBe(false);
    expect(streamer.world.has(0, 0)).toBe(false);
    expect(streamer.totalDisposed).toBeGreaterThan(0);
    expect(streamer.loadedCount).toBeLessThanOrEqual(9 + 4);
  });

  it("đi qua nhiều chunk thì bộ nhớ ổn định (số chunk giữ lại bị chặn trên)", async () => {
    const { streamer } = setup();
    let peak = 0;
    for (let step = 0; step <= 60; step++) {
      const x = (0.5 + (step / 60) * 5) * SIZE;
      streamer.update(x, x, { x: 1, z: 1 });
      await flush();
      peak = Math.max(peak, streamer.loadedCount);
    }
    expect(peak).toBeLessThanOrEqual(25);
    expect(streamer.totalLoaded).toBeGreaterThan(9);
    expect(streamer.totalLoaded - streamer.totalDisposed).toBe(streamer.loadedCount);
    streamer.dispose();
    expect(streamer.loadedCount).toBe(0);
  });

  it("thử lại khi tải lỗi ở ensureAround", async () => {
    const index = makeIndex();
    let failures = 1;
    const loader = {
      loadChunk: async (code: string) => {
        if (code === "x0_z0" && failures-- > 0) throw new Error("mạng");
        return fakeChunk(code);
      },
    } as unknown as ChunkLoader;
    const streamer = new ChunkStreamer(loader, index);
    await streamer.ensureAround(0.5 * SIZE, 0.5 * SIZE);
    expect(streamer.isLoaded("x0_z0")).toBe(true);
  });
});
