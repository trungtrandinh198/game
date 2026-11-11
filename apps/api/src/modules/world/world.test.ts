import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabase } from "@dnw/db/testing";
import { createHarness, createSeededDatabase, type TestHarness } from "../../test-helpers";

let t: TestDatabase;
let h: TestHarness;

beforeAll(async () => {
  t = await createSeededDatabase();
  h = await createHarness(t);
}, 240_000);

afterAll(async () => {
  await h?.close();
  await t?.drop();
}, 60_000);

beforeEach(async () => {
  await t.pool.query("TRUNCATE world_zones CASCADE");
  h.store.clear();
});

async function addZone(code: string, status: string, mapVersion: number) {
  await t.pool.query(
    `insert into world_zones (id, code, name, boundary, origin_lon, origin_lat, status, map_version)
     values (gen_random_uuid(), $1, $2, ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((108.2 16.0,108.3 16.0,108.3 16.1,108.2 16.1,108.2 16.0)))'), 4326), 108.2272, 16.0612, $3, $4)`,
    [code, `Zone ${code}`, status, mapVersion],
  );
}

describe("world zones", () => {
  it("liệt kê zone đang mở và đã publish bản đồ; công khai, có cache ngắn", async () => {
    await addZone("han-river-core", "active", 3);
    await addZone("draft-zone", "draft", 1);
    await addZone("no-map", "active", 0);
    const res = await h.get("/api/v1/world/zones");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
    expect(res.json().items).toEqual([
      {
        code: "han-river-core",
        name: "Zone han-river-core",
        mapVersion: 3,
        chunkSizeM: 256,
        crs: "EPSG:32649",
        origin: { lon: 108.2272, lat: 16.0612 },
        indexUrl: "http://localhost:9000/dnw-assets/zones/han-river-core/v3/index.json",
      },
    ]);
  });

  it("chi tiết zone; zone nháp, tắt, chưa có bản đồ hoặc không tồn tại đều 404", async () => {
    await addZone("han-river-core", "active", 2);
    await addZone("draft-zone", "draft", 1);
    await addZone("off-zone", "disabled", 1);
    await addZone("no-map", "active", 0);
    const ok = await h.get("/api/v1/world/zones/han-river-core");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ code: "han-river-core", mapVersion: 2, chunkSizeM: 256 });
    for (const code of ["draft-zone", "off-zone", "no-map", "ghost"]) {
      const res = await h.get(`/api/v1/world/zones/${code}`);
      expect(res.statusCode, code).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    }
  });
});
