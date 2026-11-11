import { normalizeDisplayName } from "@dnw/schemas";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminCreateError, createAdmin } from "./admin";
import type { Database } from "./client";
import { verifyPassword } from "./password";
import {
  authSessions,
  avatars,
  landmarkCategories,
  landmarks,
  playerCharacters,
  playerProgress,
  roles,
  spawnPoints,
  userProfiles,
  userRoles,
  users,
  vehicleSpawnPoints,
  vehicleTypes,
  worldZones,
} from "./schema";
import { seed } from "./seed";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.drop();
}, 60_000);

/** Lỗi PostgreSQL gốc (Drizzle bọc trong `cause`). */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
}

/** Chạy `fn` trong savepoint; mong đợi PostgreSQL trả lỗi `code`, giữ transaction ngoài còn dùng được. */
async function expectPgError(tx: Database, code: string, fn: (tx: Database) => Promise<unknown>) {
  let caught: unknown;
  try {
    await tx.transaction(async (inner) => {
      await fn(inner as unknown as Database);
    });
  } catch (e) {
    caught = e;
  }
  expect(caught, "câu lệnh đáng lẽ phải lỗi").toBeDefined();
  expect(pgCode(caught)).toBe(code);
}

const UNIQUE = "23505";
const CHECK = "23514";
const DENIED = "42501";

const polygonRing: [number, number][] = [
  [108.22, 16.07],
  [108.23, 16.07],
  [108.23, 16.08],
  [108.22, 16.08],
  [108.22, 16.07],
];

async function makeUser(tx: Database, email: string, name?: string) {
  const [u] = await tx
    .insert(users)
    .values({ email, passwordHash: "x", status: "active" })
    .returning();
  if (name) {
    await tx
      .insert(userProfiles)
      .values({ userId: u!.id, displayName: name, displayNameKey: normalizeDisplayName(name) });
  }
  return u!;
}

async function makeZone(tx: Database, code = "z1") {
  const [z] = await tx
    .insert(worldZones)
    .values({
      code,
      name: code,
      boundary: { type: "MultiPolygon", coordinates: [[polygonRing]] },
      originLon: 108.225,
      originLat: 16.075,
    })
    .returning();
  return z!;
}

async function makeLandmark(tx: Database, zoneId: string, code: string, lon: number, lat: number) {
  const [cat] = await tx
    .insert(landmarkCategories)
    .values({ code: `bridge-${code}` })
    .returning();
  const [lm] = await tx
    .insert(landmarks)
    .values({
      zoneId,
      categoryId: cat!.id,
      code,
      location: { type: "Point", coordinates: [lon, lat] },
      localX: 0,
      localZ: 0,
    })
    .returning();
  return lm!;
}

describe("migration", () => {
  it("tạo đủ 26 bảng nghiệp vụ", async () => {
    const res = await t.pool.query(
      "select count(*)::int as n from pg_tables where schemaname = $1 and tablename <> '__drizzle_migrations'",
      [t.schema],
    );
    expect(res.rows[0].n).toBe(26);
  });

  it("có các index đặc biệt (GiST, GIN trigram, expression, partial)", async () => {
    const res = await t.pool.query(
      "select indexname, indexdef from pg_indexes where schemaname = $1",
      [t.schema],
    );
    const defs = new Map<string, string>(res.rows.map((r) => [r.indexname, r.indexdef]));
    expect(defs.get("users_email_uq")).toMatch(/UNIQUE.*lower/);
    expect(defs.get("users_email_trgm_idx")).toMatch(/gin.*gin_trgm_ops/);
    expect(defs.get("landmarks_location_gix")).toMatch(/gist/);
    expect(defs.get("landmarks_location_geog_gix")).toMatch(/gist.*geography/);
    expect(defs.get("world_zones_boundary_gix")).toMatch(/gist/);
    expect(defs.get("auth_sessions_user_idx")).toMatch(/WHERE/);
    expect(defs.get("landmarks_zone_status_idx")).toMatch(/deleted_at IS NULL/);
  });
});

describe("ràng buộc", () => {
  it("email là duy nhất không phân biệt hoa thường", () =>
    t.rollback(async (tx) => {
      await makeUser(tx, "An@Example.com");
      await expectPgError(tx, UNIQUE, (x) => makeUser(x, "an@example.COM"));
    }));

  it("display_name_key duy nhất: 'Ân' trùng 'An'", () =>
    t.rollback(async (tx) => {
      await makeUser(tx, "a@example.com", "Ân");
      const b = await makeUser(tx, "b@example.com");
      await expectPgError(tx, UNIQUE, (x) =>
        x.insert(userProfiles).values({
          userId: b.id,
          displayName: "An",
          displayNameKey: normalizeDisplayName("An"),
        }),
      );
    }));

  it("CHECK từ chối giá trị sai", () =>
    t.rollback(async (tx) => {
      await expectPgError(tx, CHECK, (x) =>
        x.insert(users).values({ email: "s@example.com", status: "weird" }),
      );
      await expectPgError(tx, CHECK, (x) =>
        x.insert(userProfiles).values({
          userId: crypto.randomUUID(),
          displayName: "x",
          displayNameKey: "x",
          locale: "fr",
        }),
      );
      const zone = await makeZone(tx);
      await expectPgError(tx, CHECK, (x) =>
        x.insert(worldZones).values({
          code: "z-bad",
          name: "bad",
          boundary: { type: "MultiPolygon", coordinates: [[polygonRing]] },
          originLon: 108,
          originLat: 16,
          chunkSizeM: 32,
        }),
      );
      await expectPgError(tx, CHECK, async (x) => {
        const lm = await makeLandmark(x, zone.id, "lm-bad", 108.225, 16.075);
        await x
          .update(landmarks)
          .set({ interactionRadiusM: 500 })
          .where(sql`${landmarks.id} = ${lm.id}`);
      });
      await expectPgError(tx, CHECK, async (x) => {
        const [vt] = await x
          .insert(vehicleTypes)
          .values({ code: "v1", kind: "car", modelKey: "m", config: {} })
          .returning();
        await x.insert(vehicleSpawnPoints).values({
          zoneId: zone.id,
          vehicleTypeId: vt!.id,
          code: "vs1",
          position: { type: "Point", coordinates: [108.225, 16.075] },
          localX: 0,
          localZ: 0,
          respawnSeconds: 10,
        });
      });
      await expectPgError(tx, CHECK, (x) =>
        x.insert(vehicleTypes).values({ code: "v2", kind: "plane", modelKey: "m", config: {} }),
      );
    }));

  it("player_characters.user_id là duy nhất (1 nhân vật/người)", () =>
    t.rollback(async (tx) => {
      const u = await makeUser(tx, "pc@example.com");
      const [av] = await tx
        .insert(avatars)
        .values({
          code: "male-x",
          gender: "male",
          rig: "r",
          modelKey: "m",
          thumbnailKey: "t",
          animationSet: "a",
        })
        .returning();
      await tx.insert(playerCharacters).values({ userId: u.id, avatarId: av!.id });
      await expectPgError(tx, UNIQUE, (x) =>
        x.insert(playerCharacters).values({ userId: u.id, avatarId: av!.id }),
      );
    }));

  it("updated_at tự cập nhật ở tầng ứng dụng", () =>
    t.rollback(async (tx) => {
      const u = await makeUser(tx, "up@example.com");
      await tx.execute(sql`select pg_sleep(0.05)`);
      const [after] = await tx
        .update(users)
        .set({ status: "suspended" })
        .where(sql`${users.id} = ${u.id}`)
        .returning();
      expect(after!.updatedAt.getTime()).toBeGreaterThan(u.updatedAt.getTime());
    }));
});

describe("PostGIS", () => {
  const near = (lon: number, lat: number) => sql`
    select code from ${landmarks}
    where ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 100)`;

  it("ST_DWithin với (lon, lat) trả đúng địa danh; đảo thứ tự thì không khớp", () =>
    t.rollback(async (tx) => {
      const zone = await makeZone(tx);
      await makeLandmark(tx, zone.id, "dragon-bridge", 108.2247, 16.0612);

      const ok = await tx.execute(near(108.2247, 16.0618)); // cách ~70 m
      expect(ok.rows.map((r) => r.code)).toEqual(["dragon-bridge"]);

      const far = await tx.execute(near(108.2247, 16.07)); // cách ~1 km
      expect(far.rows).toEqual([]);

      // Đảo (lat, lon): điểm rơi vào chỗ khác hẳn, không được khớp.
      let swapped: unknown[] = [];
      try {
        swapped = (await tx.transaction((x) => x.execute(near(16.0618, 108.2247)))).rows;
      } catch {
        // PostGIS có thể từ chối vĩ độ > 90; không khớp cũng là kết quả đúng
      }
      expect(swapped).toEqual([]);
    }));

  it("ghi và đọc lại Point, Polygon, MultiPolygon dưới dạng GeoJSON [lon, lat]", () =>
    t.rollback(async (tx) => {
      const zone = await makeZone(tx);
      expect(zone.boundary).toEqual({ type: "MultiPolygon", coordinates: [[polygonRing]] });

      const [sp] = await tx
        .insert(spawnPoints)
        .values({
          zoneId: zone.id,
          position: { type: "Point", coordinates: [108.2247, 16.0612] },
          localX: 1,
          localZ: 2,
        })
        .returning();
      expect(sp!.position).toEqual({ type: "Point", coordinates: [108.2247, 16.0612] });

      const srid = await tx.execute(
        sql`select ST_SRID(position) as srid, ST_X(position) as x from ${spawnPoints}`,
      );
      expect(srid.rows[0]).toMatchObject({ srid: 4326, x: 108.2247 });
    }));

  it("từ chối hình học sai SRID/kiểu", () =>
    t.rollback(async (tx) => {
      const zone = await makeZone(tx);
      await expectPgError(tx, "22023", (x) =>
        x.execute(sql`insert into ${spawnPoints} (id, zone_id, position, local_x, local_z)
          values (gen_random_uuid(), ${zone.id}, ST_SetSRID(ST_MakePoint(1,2), 3857), 0, 0)`),
      );
    }));
});

describe("seed", () => {
  it("idempotent: chạy hai lần không tạo bản ghi trùng", () =>
    t.rollback(async (tx) => {
      const counts = async () => {
        const q = async (table: string) =>
          (await tx.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0]!["n"];
        return {
          roles: await q("roles"),
          permissions: await q("permissions"),
          role_permissions: await q("role_permissions"),
          landmark_categories: await q("landmark_categories"),
          world_zones: await q("world_zones"),
          spawn_points: await q("spawn_points"),
          avatars: await q("avatars"),
          vehicle_types: await q("vehicle_types"),
        };
      };
      await seed(tx, { dev: true });
      const first = await counts();
      await seed(tx, { dev: true });
      expect(await counts()).toEqual(first);
      expect(first).toEqual({
        roles: 5,
        permissions: 15,
        role_permissions: 6 + 4 + 14 + 15,
        landmark_categories: 7,
        world_zones: 1,
        spawn_points: 3,
        avatars: 2,
        vehicle_types: 3,
      });
    }));

  it("không có dữ liệu dev khi không bật --dev, và dữ liệu dev đúng trạng thái", () =>
    t.rollback(async (tx) => {
      await seed(tx);
      expect((await tx.select().from(worldZones)).length).toBe(0);
      await seed(tx, { dev: true });
      const [zone] = await tx.select().from(worldZones);
      expect(zone).toMatchObject({ code: "han-river-core", status: "draft" });
      const av = await tx.select().from(avatars);
      expect(av.every((a) => a.isActive)).toBe(true);
      const vt = await tx.select().from(vehicleTypes);
      expect(vt.map((v) => v.kind).sort()).toEqual(["bicycle", "car", "motorbike"]);
    }));
});

describe("quyền theo role (mục 7.11)", () => {
  it("dnw_realtime không đọc được password_hash, auth_sessions, email_tokens", () =>
    t.rollback(async (tx) => {
      const u = await makeUser(tx, "rt@example.com", "Realtime User");
      await tx.execute(sql`set local role dnw_realtime`);

      const ok = await tx.execute(sql`select id, status from ${users}`);
      expect(ok.rows).toHaveLength(1);

      await expectPgError(tx, DENIED, (x) => x.execute(sql`select password_hash from ${users}`));
      await expectPgError(tx, DENIED, (x) => x.execute(sql`select * from ${users}`));
      await expectPgError(tx, DENIED, (x) => x.execute(sql`select email from ${users}`));
      await expectPgError(tx, DENIED, (x) => x.select().from(authSessions));
      await expectPgError(tx, DENIED, (x) => x.execute(sql`select 1 from email_tokens`));
      await expectPgError(tx, DENIED, (x) => x.delete(users));

      // Được đọc profile và ghi tiến trình
      expect((await tx.select().from(userProfiles)).map((p) => p.userId)).toEqual([u.id]);
      await tx.insert(playerProgress).values({ userId: u.id, lastLocalX: 1, lastLocalZ: 2 });
      await tx.update(playerProgress).set({ lastLocalX: 5 });
      // Không được sửa nội dung
      await expectPgError(tx, DENIED, (x) =>
        x.execute(sql`update ${worldZones} set name = 'hack'`),
      );
    }));

  it("dnw_api đọc/ghi bảng nghiệp vụ", () =>
    t.rollback(async (tx) => {
      await tx.execute(sql`set local role dnw_api`);
      const u = await makeUser(tx, "api@example.com", "Api User");
      const [row] = await tx.select({ hash: users.passwordHash }).from(users);
      expect(row!.hash).toBe("x");
      await tx.delete(userProfiles);
      await tx.delete(users).where(sql`${users.id} = ${u.id}`);
    }));

  it("anon/authenticated của Supabase không đọc được bảng", () =>
    t.rollback(async (tx) => {
      for (const role of ["anon", "authenticated"]) {
        const exists = await tx.execute(sql`select 1 from pg_roles where rolname = ${role}`);
        if (exists.rows.length === 0) continue;
        await makeUser(tx, `${role}@example.com`);
        await tx.execute(sql.raw(`set local role ${role}`));
        // Không có USAGE trên schema thì tên bảng không phân giải được (42P01), có thì bị 42501.
        let caught: unknown;
        try {
          await tx.transaction((x) => x.select().from(users));
        } catch (e) {
          caught = e;
        }
        expect([DENIED, "42P01"]).toContain(pgCode(caught));
        await tx.execute(sql`reset role`);
      }
    }));
});

describe("createAdmin", () => {
  it("tạo super_admin, băm Argon2id, không lưu mật khẩu thô", () =>
    t.rollback(async (tx) => {
      await seed(tx);
      const password = "correct horse battery";
      const { userId } = await createAdmin(tx, {
        email: " Admin@Example.com ",
        password,
        displayName: "Quản Trị",
      });

      const [u] = await tx
        .select()
        .from(users)
        .where(sql`${users.id} = ${userId}`);
      expect(u).toMatchObject({ email: "admin@example.com", status: "active" });
      expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(u!.passwordHash).not.toContain(password);
      expect(await verifyPassword(u!.passwordHash!, password)).toBe(true);
      expect(await verifyPassword(u!.passwordHash!, "wrong password!!")).toBe(false);

      const links = await tx
        .select({ code: roles.code })
        .from(userRoles)
        .innerJoin(roles, sql`${roles.id} = ${userRoles.roleId}`)
        .where(sql`${userRoles.userId} = ${userId}`);
      expect(links.map((l) => l.code)).toEqual(["super_admin"]);

      const [p] = await tx
        .select()
        .from(userProfiles)
        .where(sql`${userProfiles.userId} = ${userId}`);
      expect(p!.displayNameKey).toBe("quan tri");
    }));

  it("từ chối email trùng, mật khẩu ngắn, email sai, và khi chưa seed", () =>
    t.rollback(async (tx) => {
      const base = {
        email: "dup@example.com",
        password: "long enough pw 1",
        displayName: "Dup Admin",
      };
      await expect(createAdmin(tx, base)).rejects.toThrow(/super_admin/);
      await seed(tx);
      await createAdmin(tx, base);
      await expect(
        createAdmin(tx, { ...base, email: "DUP@example.com", displayName: "Khác Tên" }),
      ).rejects.toBeInstanceOf(AdminCreateError);
      await expect(
        createAdmin(tx, { ...base, email: "n@example.com", password: "short" }),
      ).rejects.toThrow(/password/);
      await expect(createAdmin(tx, { ...base, email: "not-an-email" })).rejects.toThrow(/email/);
    }));
});
