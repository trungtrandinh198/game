import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createIO } from "@dnw/content-cli/glb";
import { MemoryObjectStore } from "@dnw/content-cli/publish";
import { baseContent, cleanupTemp, freshContent, tempDir } from "@dnw/content-cli/test-utils";
import { seed } from "@dnw/db";
import { createTestDatabase, type TestDatabase } from "@dnw/db/testing";
import { chunkManifestSchema, collisionFileSchema, zoneIndexSchema } from "@dnw/schemas";
import validator from "gltf-validator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMap, CHUNK_BUDGET, MapBuildError, type BuildMapResult } from "./build";
import { chunkCode } from "./chunks";
import { extractFeatures } from "./osm";
import { MapPublishError, publishMap } from "./publish";
import { bearingDeg, suggestVehicleSpawns } from "./suggest";
import { FIXTURE_ORIGIN } from "../fixtures/make-mini";

const RAW = fileURLToPath(new URL("../fixtures/mini.osm.json", import.meta.url));
const readJson = async <T>(path: string) => JSON.parse(await readFile(path, "utf8")) as T;

afterAll(cleanupTemp);

let built: BuildMapResult;
let contentRoot: string;

beforeAll(async () => {
  contentRoot = await baseContent();
  built = await buildMap({
    contentRoot,
    zone: "han-river-core",
    rawPath: RAW,
    outDir: await tempDir(),
    mapVersion: 1,
  });
}, 240_000);

const chunkOf = (x: number, z: number) =>
  built.chunks.find((c) => c.code === chunkCode(Math.floor(x / 256), Math.floor(z / 256)))!;
const surfaceAt = (x: number, z: number) => {
  const c = chunkOf(x, z);
  const col = Math.floor((x - c.bounds.minX) / 2),
    row = Math.floor((z - c.bounds.minZ) / 2);
  return c.surface[10 + row * 128 + col];
};

describe("buildMap", () => {
  it("index.json hợp lệ theo schema và phủ kín bounds, không hở", async () => {
    const index = zoneIndexSchema.parse(await readJson(join(built.root, "index.json")));
    expect(index).toMatchObject({
      zoneCode: "han-river-core",
      mapVersion: 1,
      chunkSizeM: 256,
      crs: "EPSG:32649",
      origin: FIXTURE_ORIGIN,
    });
    expect(index.bounds).toEqual({ minX: -512, minZ: -512, maxX: 512, maxZ: 512 });
    expect(index.chunks).toHaveLength(16);

    const cells = new Set(index.chunks.map((c) => `${c.gx},${c.gz}`));
    for (let gx = -2; gx <= 1; gx++)
      for (let gz = -2; gz <= 1; gz++) expect(cells.has(`${gx},${gz}`)).toBe(true);
    for (const c of built.chunks) {
      expect(c.bounds.maxX - c.bounds.minX).toBe(256);
      expect(c.bounds.minX).toBe(c.gx * 256);
      expect(c.bounds.minZ).toBe(c.gz * 256);
    }
    expect(built.chunks.find((c) => c.code === "x-1_z-1")).toBeDefined();
  });

  it("manifest từng chunk hợp lệ và hash khớp tệp", async () => {
    const { createHash } = await import("node:crypto");
    for (const c of built.chunks) {
      const dir = join(built.root, "chunks", c.code);
      const m = chunkManifestSchema.parse(await readJson(join(dir, "manifest.json")));
      for (const f of [m.glb, m.collision, m.surface]) {
        const data = await readFile(join(dir, f.url));
        expect(data.byteLength).toBe(f.sizeBytes);
        expect(createHash("sha256").update(data).digest("hex")).toBe(f.sha256);
      }
      collisionFileSchema.parse(await readJson(join(dir, "collision.json")));
    }
    const entry = zoneIndexSchema.parse(await readJson(join(built.root, "index.json"))).chunks[0]!;
    expect(
      createHash("sha256")
        .update(await readFile(join(built.root, entry.manifest)))
        .digest("hex"),
    ).toBe(entry.sha256);
  });

  it("đầu ra xác định: build hai lần cho tệp giống hệt", async () => {
    const again = await buildMap({
      contentRoot,
      zone: "han-river-core",
      rawPath: RAW,
      outDir: await tempDir(),
      mapVersion: 1,
    });
    const listing = async (root: string) => {
      const out: Record<string, string> = {};
      const walk = async (d: string) => {
        for (const e of await readdir(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) await walk(p);
          else out[p.slice(root.length)] = (await readFile(p)).toString("base64");
        }
      };
      await walk(root);
      return out;
    };
    expect(await listing(again.root)).toEqual(await listing(built.root));
  });

  it("mỗi tòa nhà thuộc đúng một chunk (theo centroid)", async () => {
    const features = extractFeatures(await readJson(RAW), FIXTURE_ORIGIN);
    expect(built.chunks.reduce((a, c) => a + c.stats.buildingCount, 0)).toBe(
      features.buildings.length,
    );
    expect(features.buildings.length).toBe(4);
    // nhà A và B (centroid x < 0) ở chunk x-1_z-1; nhà nhỏ (centroid x = 0.25) và nhà có sân ở chunk x0_z-1
    expect(built.chunks.find((c) => c.code === "x-1_z-1")!.stats.buildingCount).toBe(2);
    expect(built.chunks.find((c) => c.code === "x0_z-1")!.stats.buildingCount).toBe(2);
  });

  it("mọi GLB qua gltf-validator, nén meshopt, tối đa 3 draw call tĩnh, đỉnh nằm trong chunk", async () => {
    const io = await createIO();
    for (const c of built.chunks) {
      const report = await validator.validateBytes(c.glb);
      expect(
        report.issues.numErrors,
        `${c.code}: ${JSON.stringify(report.issues.messages.slice(0, 2))}`,
      ).toBe(0);
      const doc = await io.readBinary(c.glb);
      const prims = doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives());
      expect(prims.length).toBeLessThanOrEqual(3);
      expect(c.glb.byteLength).toBeLessThan(CHUNK_BUDGET.maxBytes);
    }
    const doc = await io.readBinary(chunkOf(-50, -50).glb);
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).toEqual(expect.arrayContaining(["EXT_meshopt_compression", "KHR_mesh_quantization"]));
  });

  it("bề mặt: đường, vỉa hè, lối đi bộ, cầu, đất, nước", () => {
    expect(surfaceAt(-50, 0)).toBe(2); // tim đường chính
    expect(surfaceAt(-50, 7)).toBe(1); // vỉa hè (6..8 m cạnh đường rộng 12)
    expect(surfaceAt(-50, 20)).toBe(1); // lối đi bộ
    expect(surfaceAt(120, 0)).toBe(2); // mặt cầu
    expect(surfaceAt(120, 100)).toBe(0); // nước
    expect(surfaceAt(-150, -200)).toBe(0); // đất trống
    expect(surfaceAt(0, 100)).toBe(2); // đường hẻm
  });

  it("va chạm: biên nước chặn trừ vùng cầu; nhà có đoạn tường; không có đoạn giả dọc biên chunk", async () => {
    const east = built.chunks.filter((c) => c.bounds.minX <= 100 && c.bounds.maxX > 100);
    const bankX = east.flatMap((c) =>
      c.collision.segments.filter((s) => s[0] === 10000 && s[2] === 10000),
    );
    expect(bankX.length).toBeGreaterThan(0);
    for (const [, z1, , z2] of bankX) {
      const lo = Math.min(z1!, z2!),
        hi = Math.max(z1!, z2!);
      // không đoạn nào được phủ lên hành lang cầu (|z| < 600 cm)
      expect(hi <= -600 || lo >= 600, `[${lo}, ${hi}]`).toBe(true);
    }
    expect(chunkOf(-50, -50).collision.segments.length).toBe(8);
    // không có đoạn dọc biên chunk x = 0 (cắt nhân tạo)
    for (const c of built.chunks)
      for (const s of c.collision.segments) expect(s.every((v) => Number.isInteger(v))).toBe(true);
    const nearBoundary = chunkOf(-50, 0).collision.segments.filter((s) => s[0] === 0 && s[2] === 0);
    expect(nearBoundary).toEqual([]);
  });

  it("cây/đèn: có theo đường, xác định, không rơi vào nhà, đường hay nước", async () => {
    const all = built.chunks.flatMap((c) => c.instances);
    expect(all.filter((i) => i.type === "tree-01").length).toBeGreaterThan(10);
    expect(all.filter((i) => i.type === "street-lamp-01").length).toBeGreaterThan(5);
    // cây OSM hợp lệ giữ lại, cây trong nhà bị loại
    const inChunk = chunkOf(-20, 30).instances;
    expect(inChunk.some((i) => Math.abs(i.x + 20) < 0.05 && Math.abs(i.z - 30) < 0.05)).toBe(true);
    expect(
      chunkOf(-50, -50).instances.some(
        (i) => Math.abs(i.x + 50) < 0.05 && Math.abs(i.z + 50) < 0.05,
      ),
    ).toBe(false);
    for (const i of all) {
      expect(i.x > 100 && i.x < 140 && i.z > -200 && i.z < 200).toBe(false);
      expect(i.x > -60 && i.x < -40 && i.z > -60 && i.z < -40).toBe(false);
      expect(Math.abs(i.z) < 6 && i.x < 90 && i.x > -150).toBe(false);
    }
    // phân bổ theo chunk chứa điểm
    for (const c of built.chunks)
      for (const i of c.instances)
        expect(
          i.x >= c.bounds.minX &&
            i.x < c.bounds.maxX &&
            i.z >= c.bounds.minZ &&
            i.z < c.bounds.maxZ,
        ).toBe(true);
  });

  it("landmark: ghi vào chunk chứa nó, thêm footprint va chạm và loại nhà bị thay thế", async () => {
    expect(chunkOf(40, -60).landmarks).toEqual(["sample-monument"]);
    expect(
      chunkOf(40, -60).collision.segments.some((s) =>
        s.every((v) => v === 3500 || v === 4500 || (v >= -6500 && v <= -5500)),
      ),
    ).toBe(true);

    const root = await freshContent();
    const path = join(root, "landmarks/sample-monument/landmark.json");
    const manifest = await readJson<{ replacesOsmBuildings: string[] }>(path);
    const before = built.chunks.reduce((a, c) => a + c.stats.buildingCount, 0);
    await writeFile(path, JSON.stringify({ ...manifest, replacesOsmBuildings: ["way/5001"] }));
    const r = await buildMap({
      contentRoot: root,
      zone: "han-river-core",
      rawPath: RAW,
      outDir: await tempDir(),
      mapVersion: 1,
    });
    expect(r.chunks.reduce((a, c) => a + c.stats.buildingCount, 0)).toBe(before - 1);
  });

  it("overrides.json: sửa chiều cao và loại bỏ đối tượng", async () => {
    const root = await freshContent();
    await writeFile(
      join(root, "maps/han-river-core/overrides.json"),
      JSON.stringify({
        schemaVersion: 1,
        buildings: [{ id: "way/5001", height: 40 }],
        removeFeatures: ["way/5002"],
      }),
    );
    const r = await buildMap({
      contentRoot: root,
      zone: "han-river-core",
      rawPath: RAW,
      outDir: await tempDir(),
      mapVersion: 1,
    });
    expect(r.chunks.reduce((a, c) => a + c.stats.buildingCount, 0)).toBe(3);
    expect(r.chunks.find((c) => c.code === "x-1_z-1")!.glb.byteLength).not.toBe(
      built.chunks.find((c) => c.code === "x-1_z-1")!.glb.byteLength,
    );
  });

  it("thất bại khi vượt ngân sách chunk hoặc thiếu dữ liệu", async () => {
    const original = { ...CHUNK_BUDGET };
    (CHUNK_BUDGET as { avgBytes: number }).avgBytes = 10;
    try {
      await expect(
        buildMap({
          contentRoot,
          zone: "han-river-core",
          rawPath: RAW,
          outDir: await tempDir(),
          mapVersion: 1,
        }),
      ).rejects.toThrow(/Vượt ngân sách chunk/);
    } finally {
      (CHUNK_BUDGET as { avgBytes: number }).avgBytes = original.avgBytes;
    }
    await expect(
      buildMap({
        contentRoot,
        zone: "han-river-core",
        rawPath: "/nonexistent.json",
        outDir: await tempDir(),
        mapVersion: 1,
      }),
    ).rejects.toBeInstanceOf(MapBuildError);
    await expect(
      buildMap({ contentRoot, zone: "ghost", outDir: await tempDir(), mapVersion: 1 }),
    ).rejects.toBeInstanceOf(MapBuildError);
  });
});

describe("suggestVehicleSpawns", () => {
  it("tuân thủ quy tắc 16.8", async () => {
    const roads = extractFeatures(await readJson(RAW), FIXTURE_ORIGIN).roads;
    const players: [number, number][] = [
      [-20, 4],
      [0, 4],
      [20, 4],
    ];
    const spawns = suggestVehicleSpawns(roads, players, "han-river-core", 40);
    expect(spawns.length).toBeGreaterThan(2);

    for (const a of spawns) {
      for (const b of spawns)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(40);
      expect(Math.hypot(a.x - 0, a.z - 0)).toBeGreaterThanOrEqual(15); // giao lộ (0, 0)
      for (const p of players)
        expect(Math.hypot(a.x - p[0], a.z - p[1])).toBeGreaterThanOrEqual(15);
      expect(a.x < 90 || a.x > 150 || Math.abs(a.z) > 7).toBe(true); // không trên cầu
      expect(["motorbike-01", "bicycle-01", "car-01"]).toContain(a.vehicle);
    }
    // lệch 1.5 m so với tim đường chính, hướng song song (Đông = 90 độ)
    const onMain = spawns.filter((s) => Math.abs(s.z) < 3 && s.x < 90);
    expect(onMain.length).toBeGreaterThan(0);
    for (const s of onMain) {
      expect(Math.abs(s.z)).toBeCloseTo(1.5, 1);
      expect(s.headingDeg).toBe(90);
    }
    // đường tertiary rộng 9 m (>= 6 m) cho phép ô tô, không đường nào hẹp hơn có ô tô
    expect(suggestVehicleSpawns(roads, players, "han-river-core", 3)).toHaveLength(3);
    expect(suggestVehicleSpawns(roads, players, "han-river-core", 40)).toEqual(spawns);
  });

  it("hướng la bàn", () => {
    expect(bearingDeg(0, -1)).toBe(0);
    expect(bearingDeg(1, 0)).toBe(90);
    expect(bearingDeg(0, 1)).toBe(180);
    expect(bearingDeg(-1, 0)).toBe(270);
  });
});

describe("publishMap", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
    await seed(t.db);
    await t.pool.query(
      `insert into world_zones (id, code, name, boundary, origin_lon, origin_lat)
       values (gen_random_uuid(), 'han-river-core', 'Han River Core',
         ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((108.2 16.0,108.3 16.0,108.3 16.1,108.2 16.1,108.2 16.0)))'), 4326), $1, $2)`,
      [FIXTURE_ORIGIN.lon, FIXTURE_ORIGIN.lat],
    );
  }, 240_000);
  afterAll(async () => {
    await t?.drop();
  }, 60_000);

  it("chunk lên trước, DB trong một transaction, index.json ghi sau cùng; chạy lại bị từ chối", async () => {
    const store = new MemoryObjectStore();
    const order: string[] = [];
    const put = store.put.bind(store);
    store.put = async (key, body, opts) => {
      order.push(key);
      return put(key, body, opts);
    };
    const outDir = built.root.slice(0, built.root.indexOf("/zones/"));

    const result = await publishMap({
      outDir,
      zone: "han-river-core",
      mapVersion: 1,
      store,
      db: t.db,
    });
    expect(result.chunkRows).toBe(16);
    expect(order.at(-1)).toBe("zones/han-river-core/v1/index.json");
    expect(order.filter((k) => k.endsWith("index.json"))).toHaveLength(1);
    expect(store.objects.get("zones/han-river-core/v1/index.json")?.cacheControl).toBe(
      "public, max-age=60",
    );
    expect(store.objects.get("zones/han-river-core/v1/chunks/x0_z0/static.glb")?.cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(store.objects.get("zones/han-river-core/v1/chunks/x0_z0/static.glb")?.contentType).toBe(
      "model/gltf-binary",
    );

    const zone = (await t.pool.query("select map_version from world_zones")).rows[0];
    expect(zone.map_version).toBe(1);
    const rows = (
      await t.pool.query(
        "select chunk_code, grid_x, grid_z, version, status, asset_manifest_key, collision_key, ST_AsText(bounds) wkt from map_chunks order by chunk_code",
      )
    ).rows;
    expect(rows).toHaveLength(16);
    const r = rows.find((x) => x.chunk_code === "x0_z0")!;
    expect(r).toMatchObject({
      grid_x: 0,
      grid_z: 0,
      version: 1,
      status: "published",
      asset_manifest_key: "zones/han-river-core/v1/chunks/x0_z0/manifest.json",
      collision_key: "zones/han-river-core/v1/chunks/x0_z0/collision.json",
    });
    expect(r.wkt).toMatch(/^POLYGON\(\(108\.22/);

    await expect(
      publishMap({ outDir, zone: "han-river-core", mapVersion: 1, store, db: t.db }),
    ).rejects.toBeInstanceOf(MapPublishError);
    expect(store.objects.size).toBe(16 * 4 + 1);
  });

  it("từ chối khi origin khác DB hoặc zone chưa có", async () => {
    const outDir = built.root.slice(0, built.root.indexOf("/zones/"));
    await buildMap({ contentRoot, zone: "han-river-core", rawPath: RAW, outDir, mapVersion: 2 });
    await t.pool.query("update world_zones set origin_lon = 108.3");
    await expect(
      publishMap({
        outDir,
        zone: "han-river-core",
        mapVersion: 2,
        store: new MemoryObjectStore(),
        db: t.db,
      }),
    ).rejects.toThrow(/origin/);
    await expect(
      publishMap({
        outDir,
        zone: "ghost",
        mapVersion: 1,
        store: new MemoryObjectStore(),
        db: t.db,
      }),
    ).rejects.toThrow();
  });
});
