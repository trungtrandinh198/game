import { jwtVerify } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabase } from "@dnw/db/testing";
import { TICKET_AUDIENCE, TICKET_ISSUER } from "@dnw/schemas";
import { DEV_TICKET_SECRET } from "../../lib/ticket";
import { createHarness, createSeededDatabase, insertAvatar, loginAs, type TestHarness } from "../../test-helpers";

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
  await h.reset();
  await t.pool.query("TRUNCATE world_zones CASCADE");
});

async function addZone(code: string, status = "active", mapVersion = 1) {
  await t.pool.query(
    `insert into world_zones (id, code, name, boundary, origin_lon, origin_lat, status, map_version)
     values (gen_random_uuid(), $1, $1, ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((108.2 16.0,108.3 16.0,108.3 16.1,108.2 16.1,108.2 16.0)))'), 4326), 108.2272, 16.0612, $2, $3)`,
    [code, status, mapVersion],
  );
}

async function player(email = "p@example.com", name = "Player One") {
  const cookie = await loginAs(h, { email, displayName: name });
  const avatar = await insertAvatar(t, `male-${Math.random().toString(36).slice(2, 6)}`);
  await h.send("POST", "/api/v1/player/characters", { avatarId: avatar }, { cookie });
  return cookie;
}

describe("POST /world/join", () => {
  it("cần đăng nhập", async () => {
    const res = await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" });
    expect(res.statusCode).toBe(401);
  });

  it("chưa có nhân vật thì 412 CHARACTER_REQUIRED", async () => {
    await addZone("han-river-core");
    const cookie = await loginAs(h, { email: "a@example.com", displayName: "No Char" });
    const res = await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.code).toBe("CHARACTER_REQUIRED");
  });

  it("zone nháp, tắt, chưa có bản đồ hoặc không tồn tại thì 412 ZONE_UNAVAILABLE", async () => {
    const cookie = await player();
    await addZone("draft-zone", "draft");
    await addZone("off-zone", "disabled");
    await addZone("no-map", "active", 0);
    for (const zoneCode of ["draft-zone", "off-zone", "no-map", "ghost"]) {
      const res = await h.send("POST", "/api/v1/world/join", { zoneCode }, { cookie });
      expect(res.statusCode, zoneCode).toBe(412);
      expect(res.json().error.code).toBe("ZONE_UNAVAILABLE");
    }
  });

  it("cấp ticket HS256 60 giây với đúng claim; không có bí mật server trong phản hồi", async () => {
    await addZone("han-river-core");
    const cookie = await player();
    const res = await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(["protocolVersion", "realtimeUrl", "roomName", "ticket", "zoneCode"]);
    expect(body).toMatchObject({ realtimeUrl: "ws://localhost:2567", roomName: "city", protocolVersion: 1, zoneCode: "han-river-core" });

    const { payload, protectedHeader } = await jwtVerify(body.ticket, new TextEncoder().encode(DEV_TICKET_SECRET), {
      issuer: TICKET_ISSUER,
      audience: TICKET_AUDIENCE,
    });
    expect(protectedHeader.alg).toBe("HS256");
    const { rows } = await t.pool.query("select id from users");
    expect(payload.sub).toBe(rows[0].id);
    expect(payload["zone"]).toBe("han-river-core");
    expect(payload["pv"]).toBe(1);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(JSON.stringify(body)).not.toContain(DEV_TICKET_SECRET);
  });

  it("mỗi lần gọi một jti khác nhau", async () => {
    await addZone("han-river-core");
    const cookie = await player();
    const jtis = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const res = await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie });
      const { payload } = await jwtVerify(res.json().ticket, new TextEncoder().encode(DEV_TICKET_SECRET));
      jtis.add(payload.jti!);
    }
    expect(jtis.size).toBe(3);
  });

  it("tài khoản bị khóa sau khi đăng nhập thì không xin được ticket", async () => {
    await addZone("han-river-core");
    const cookie = await player();
    await t.pool.query("update users set status = 'suspended'");
    expect((await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie })).statusCode).toBe(401);
  });

  it("giới hạn 20 lần mỗi phút mỗi người dùng", async () => {
    await addZone("han-river-core");
    const cookie = await player();
    for (let i = 0; i < 20; i++) {
      expect((await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie })).statusCode).toBe(200);
    }
    const res = await h.send("POST", "/api/v1/world/join", { zoneCode: "han-river-core" }, { cookie });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });
});
