import { cp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seed } from "@dnw/db";
import { createTestDatabase, type TestDatabase } from "@dnw/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildContent } from "./build";
import { newContent } from "./new";
import { readJson } from "./paths";
import { headingToRotY, syncContent } from "./sync";
import { cleanupTemp, freshContent, tempDir } from "./test-utils";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await seed(t.db);
}, 240_000);

afterAll(async () => {
  await t?.drop();
  await cleanupTemp();
}, 60_000);

beforeEach(async () => {
  await t.pool.query("TRUNCATE world_zones, avatars, vehicle_types CASCADE");
});

async function buildAndSync(root: string) {
  const dist = await tempDir();
  const catalog = await buildContent(root, dist);
  return syncContent(t.db, root, catalog);
}

const q = async (sql: string, params: unknown[] = []) => (await t.pool.query(sql, params)).rows;

async function snapshot() {
  const tables = [
    "world_zones",
    "avatars",
    "vehicle_types",
    "landmarks",
    "landmark_translations",
    "landmark_media",
    "spawn_points",
    "vehicle_spawn_points",
  ];
  const out: Record<string, unknown> = {};
  for (const table of tables) out[table] = await q(`select * from ${table} order by id`);
  return JSON.stringify(out);
}

describe("syncContent", () => {
  it("tạo mục mới ở trạng thái tắt/draft với khóa object storage đúng", async () => {
    const result = await buildAndSync(await freshContent());
    expect(result.created).toEqual({
      zone: 1,
      vehicle: 3,
      character: 4,
      landmark: 1,
      translation: 2,
      spawn: 3,
      vehicle_spawn: 3,
    });
    expect(result.updated).toEqual({});

    expect(
      await q(
        "select is_active, model_key, thumbnail_key, content_version, rig from avatars order by code",
      ),
    ).toEqual(
      ["female-01", "female-02", "male-01", "male-02"].map((code) => ({
        is_active: false,
        model_key: expect.stringMatching(
          new RegExp(`^characters/${code}/v1-[0-9a-f]{8}/model\\.glb$`),
        ),
        thumbnail_key: expect.stringMatching(
          new RegExp(`^characters/${code}/v1-[0-9a-f]{8}/thumbnail\\.webp$`),
        ),
        content_version: 1,
        rig: "humanoid_v1",
      })),
    );
    const [zone] = await q("select * from world_zones");
    expect(zone).toMatchObject({
      code: "han-river-core",
      status: "draft",
      map_version: 0,
      crs: "EPSG:32649",
      chunk_size_m: 256,
      origin_lon: 108.2272,
      origin_lat: 16.0612,
    });

    const vehicles = await q(
      "select code, kind, is_active, config from vehicle_types order by code",
    );
    expect(vehicles.map((v) => [v.code, v.kind, v.is_active])).toEqual([
      ["bicycle-01", "bicycle", false],
      ["car-01", "car", false],
      ["motorbike-01", "motorbike", false],
    ]);
    expect(vehicles[1].config.handling.maxSpeed).toBe(18);
    expect(vehicles[1].config.seats[0].socket).toBe("seat_driver");

    const [lm] = await q(
      "select l.*, c.code as category from landmarks l join landmark_categories c on c.id = l.category_id",
    );
    expect(lm).toMatchObject({
      code: "sample-monument",
      status: "draft",
      category: "park",
      interaction_radius_m: 25,
    });
    expect(Math.abs(lm.local_x - 40)).toBeLessThan(0.05);
    expect(Math.abs(lm.local_z + 60)).toBeLessThan(0.05);
    expect(lm.model_key).toMatch(/^landmarks\/sample-monument\/v1-[0-9a-f]{8}\/model\.glb$/);
    expect(lm.cover_image_key).toMatch(/\/media\/cover\.webp$/);

    const translations = await q(
      "select locale, name, review_status from landmark_translations order by locale",
    );
    expect(translations).toEqual([
      { locale: "en", name: "Sample monument", review_status: "draft" },
      { locale: "vi", name: "Đài tưởng niệm mẫu", review_status: "draft" },
    ]);
    expect((await q("select copyright_credit, alt_text from landmark_media"))[0]).toMatchObject({
      alt_text: { vi: "Ảnh minh họa", en: "Placeholder image" },
    });

    const vs = await q(
      "select code, local_x, local_z, heading_y, is_active from vehicle_spawn_points order by code",
    );
    expect(vs.map((v) => v.code)).toEqual(["vs-001", "vs-002", "vs-003"]);
    expect(vs[0].heading_y).toBeCloseTo(Math.PI / 2, 4);
    expect(vs.every((v) => v.is_active)).toBe(true);
    expect(
      (await q("select local_x, local_z from spawn_points order by local_x")).map(
        (s) => Math.round(s.local_x) + 0,
      ),
    ).toEqual([-20, 0, 20]);
  });

  it("chạy hai lần không đổi gì (kể cả updated_at)", async () => {
    const root = await freshContent();
    const dist = await tempDir();
    const catalog = await buildContent(root, dist);
    await syncContent(t.db, root, catalog);
    const before = await snapshot();
    const again = await syncContent(t.db, root, catalog);
    expect(again).toEqual({ created: {}, updated: {} });
    expect(await snapshot()).toBe(before);
  });

  it("sửa trong DB rồi sync lại thì KHÔNG bị ghi đè phần DB sở hữu", async () => {
    const root = await freshContent();
    const dist = await tempDir();
    const catalog = await buildContent(root, dist);
    await syncContent(t.db, root, catalog);

    await q("update avatars set is_active = true, sort_order = 7 where code = 'male-01'");
    await q("update vehicle_types set is_active = true, sort_order = 3 where code = 'car-01'");
    await q("update world_zones set status = 'active'");
    await q("update landmarks set status = 'published', interaction_radius_m = 77, sort_order = 9");
    await q(
      "update landmark_translations set name = 'Tên do admin sửa', review_status = 'reviewed' where locale = 'vi'",
    );
    await q("update landmark_media set copyright_credit = 'Admin credit'");
    await q("update spawn_points set is_active = false");
    await q("update vehicle_spawn_points set is_active = false where code = 'vs-001'");
    const before = await snapshot();

    const result = await syncContent(t.db, root, catalog);
    expect(result).toEqual({ created: {}, updated: {} });
    expect(await snapshot()).toBe(before);
    expect(
      (await q("select is_active, sort_order from avatars where code = 'male-01'"))[0],
    ).toEqual({ is_active: true, sort_order: 7 });
    expect(
      (await q("select name, review_status from landmark_translations where locale = 'vi'"))[0],
    ).toEqual({ name: "Tên do admin sửa", review_status: "reviewed" });
  });

  it("đổi phần Git sở hữu thì cập nhật, vẫn giữ phần DB sở hữu; thiếu bản dịch thì khởi tạo lại", async () => {
    const root = await freshContent();
    await buildAndSync(root);
    await q("update vehicle_types set is_active = true where code = 'car-01'");
    await q("update landmark_translations set name = 'Admin' where locale = 'vi'");
    await q("delete from landmark_translations where locale = 'en'");

    const path = join(root, "vehicles/car-01/vehicle.json");
    const manifest = (await readJson(path)) as { version: number; handling: { maxSpeed: number } };
    await writeFile(
      path,
      JSON.stringify({ ...manifest, version: 2, handling: { ...manifest.handling, maxSpeed: 20 } }),
    );

    const result = await buildAndSync(root);
    expect(result.updated).toEqual({ vehicle: 1 });
    expect(result.created).toEqual({ translation: 1 });
    const [car] = await q("select * from vehicle_types where code = 'car-01'");
    expect(car).toMatchObject({ is_active: true, content_version: 2 });
    expect(car.model_key).toMatch(/\/v2-[0-9a-f]{8}\/model\.glb$/);
    expect(car.config.handling.maxSpeed).toBe(20);
    expect(
      (await q("select name from landmark_translations order by locale")).map((r) => r.name),
    ).toEqual(["Sample monument", "Admin"]);
  });

  it("gốc tọa độ của zone chỉ đổi khi chưa publish bản đồ", async () => {
    const root = await freshContent();
    const dist = await tempDir();
    await syncContent(t.db, root, await buildContent(root, dist));
    const path = join(root, "maps/han-river-core/zone.json");
    const zone = (await readJson(path)) as { origin: { lon: number; lat: number }; name: string };

    await writeFile(path, JSON.stringify({ ...zone, origin: { lon: 108.2275, lat: 16.0615 } }));
    expect((await syncContent(t.db, root, await buildContent(root, dist))).updated).toEqual({
      zone: 1,
      vehicle_spawn: 3,
      spawn: 3,
    });
    expect((await q("select origin_lon from world_zones"))[0].origin_lon).toBe(108.2275);

    await q("update world_zones set map_version = 1");
    await writeFile(
      path,
      JSON.stringify({ ...zone, name: "Tên mới", origin: { lon: 108.2278, lat: 16.0618 } }),
    );
    await syncContent(t.db, root, await buildContent(root, dist));
    expect((await q("select origin_lon, name from world_zones"))[0]).toEqual({
      origin_lon: 108.2275,
      name: "Tên mới",
    });
  });

  it("từ chối khi content không hợp lệ, thiếu catalog hoặc thiếu danh mục", async () => {
    const root = await freshContent();
    const dist = await tempDir();
    const catalog = await buildContent(root, dist);

    await expect(
      syncContent(t.db, root, {
        ...catalog,
        items: catalog.items.filter((i) => i.id !== "male-01"),
      }),
    ).rejects.toThrow(/chưa có trong catalog/);

    await q("delete from landmark_categories where code = 'park'");
    await expect(syncContent(t.db, root, catalog)).rejects.toThrow(/danh mục "park"/);
    await q("insert into landmark_categories (id, code) values (gen_random_uuid(), 'park')");

    await rm(join(root, "characters/male-02/model.glb"));
    await expect(syncContent(t.db, root, catalog)).rejects.toThrow(/không hợp lệ/);
    expect(await q("select 1 from avatars")).toHaveLength(0);
  });

  it("quy trình thêm nhân vật mới chỉ bằng thư mục content, không sửa code", async () => {
    const root = await freshContent();
    await buildAndSync(root);

    const target = await newContent(root, "character", "test-01");
    await cp(join(root, "characters/female-01/model.glb"), join(target, "model.glb"));
    await cp(join(root, "characters/female-01/thumbnail.webp"), join(target, "thumbnail.webp"));
    const result = await buildAndSync(root);

    expect(result.created).toEqual({ character: 1 });
    expect(
      (await q("select code, is_active, gender from avatars where code = 'test-01'"))[0],
    ).toEqual({ code: "test-01", is_active: false, gender: "male" });
  });
});

describe("headingToRotY", () => {
  it("la bàn (0 = Bắc, 90 = Đông) sang rotY (0 hướng +Z)", () => {
    expect(headingToRotY(0)).toBeCloseTo(Math.PI, 6);
    expect(headingToRotY(90)).toBeCloseTo(Math.PI / 2, 6);
    expect(headingToRotY(180)).toBeCloseTo(0, 6);
    expect(headingToRotY(270)).toBeCloseTo(-Math.PI / 2, 6);
  });
});
