import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabase } from "@dnw/db/testing";
import { setBlockedNameTerms } from "../../lib/name-policy";
import {
  createHarness,
  createSeededDatabase,
  insertAvatar,
  loginAs,
  type TestHarness,
} from "../../test-helpers";

let t: TestDatabase;
let h: TestHarness;

beforeAll(async () => {
  t = await createSeededDatabase();
  h = await createHarness(t);
}, 240_000);

afterAll(async () => {
  setBlockedNameTerms([]);
  await h?.close();
  await t?.drop();
}, 60_000);

beforeEach(async () => {
  await h.reset();
  setBlockedNameTerms([]);
});

const A = { email: "a@example.com", displayName: "Minh An" };
const B = { email: "b@example.com", displayName: "Bình Bông" };

describe("xác thực", () => {
  it("mọi endpoint player cần session; /avatars là công khai", async () => {
    const reqs: [string, string][] = [
      ["GET", "/api/v1/player/profile"],
      ["PATCH", "/api/v1/player/profile"],
      ["GET", "/api/v1/player/characters"],
      ["POST", "/api/v1/player/characters"],
      ["PATCH", "/api/v1/player/characters/0190f3a0-0000-7000-8000-000000000000"],
      ["GET", "/api/v1/player/progress"],
    ];
    for (const [method, url] of reqs) {
      const body = url.endsWith("/profile")
        ? { bio: "x" }
        : url.includes("/characters/")
          ? { characterName: "Abc" }
          : { avatarId: "0190f3a0-0000-7000-8000-000000000000" };
      const res = method === "GET" ? await h.get(url) : await h.send(method as "POST", url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    expect((await h.get("/api/v1/avatars")).statusCode).toBe(200);
  });
});

describe("hồ sơ", () => {
  it("GET trả hồ sơ; PATCH cập nhật locale, quốc gia, bio", async () => {
    const cookie = await loginAs(h, A);
    const got = await h.get("/api/v1/player/profile", { cookie });
    expect(got.json()).toMatchObject({
      email: "a@example.com",
      displayName: "Minh An",
      locale: "vi",
      countryCode: null,
      bio: null,
    });

    const res = await h.send(
      "PATCH",
      "/api/v1/player/profile",
      { locale: "en", countryCode: "vn", bio: "  Xin chào  " },
      { cookie },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ locale: "en", countryCode: "VN", bio: "Xin chào" });
    const cleared = await h.send(
      "PATCH",
      "/api/v1/player/profile",
      { bio: null, countryCode: null },
      { cookie },
    );
    expect(cleared.json()).toMatchObject({ bio: null, countryCode: null });
  });

  it("locale chỉ nhận vi/en; từ chối khóa lạ và body rỗng; bio tối đa 160", async () => {
    const cookie = await loginAs(h, A);
    for (const body of [
      { locale: "fr" },
      { role: "admin" },
      {},
      { bio: "x".repeat(161) },
      { countryCode: "VNM" },
    ]) {
      const res = await h.send("PATCH", "/api/v1/player/profile", body, { cookie });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("đổi tên hiển thị: trùng sau chuẩn hóa dấu/hoa thường thì 409; đổi lại tên của chính mình được", async () => {
    const ca = await loginAs(h, A);
    await loginAs(h, { ...B, displayName: "Bình" });

    const taken = await h.send(
      "PATCH",
      "/api/v1/player/profile",
      { displayName: "BINH" },
      { cookie: ca },
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe("CONFLICT_DISPLAY_NAME_TAKEN");

    const same = await h.send(
      "PATCH",
      "/api/v1/player/profile",
      { displayName: "MINH AN" },
      { cookie: ca },
    );
    expect(same.statusCode).toBe(200);
    expect(same.json().displayName).toBe("MINH AN");

    const { rows } = await t.pool.query(
      "select display_name_key from user_profiles order by display_name_key",
    );
    expect(rows.map((r) => r.display_name_key)).toEqual(["binh", "minh an"]);
  });

  it("từ chối tên sai quy tắc ký tự/độ dài", async () => {
    const cookie = await loginAs(h, A);
    for (const displayName of ["ab", "x".repeat(33), "tên<script>", "emoji😀name"]) {
      const res = await h.send("PATCH", "/api/v1/player/profile", { displayName }, { cookie });
      expect(res.statusCode, displayName).toBe(400);
    }
  });

  it("điểm móc từ cấm chặn tên có chứa từ cấm", async () => {
    const cookie = await loginAs(h, A);
    setBlockedNameTerms(["badword"]);
    const res = await h.send(
      "PATCH",
      "/api/v1/player/profile",
      { displayName: "Mr BadWord" },
      { cookie },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0]).toEqual({ path: "displayName", issue: "name_not_allowed" });
  });
});

describe("danh mục avatar", () => {
  it("chỉ trả avatar đang bật, kèm URL dựng từ khóa object storage", async () => {
    await insertAvatar(t, "male-01", true);
    await insertAvatar(t, "male-02", false);
    const res = await h.get("/api/v1/avatars");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/public/);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: "male-01",
      modelUrl: "http://localhost:9000/dnw-assets/characters/male-01/v1/model.glb",
      thumbnailUrl: "http://localhost:9000/dnw-assets/characters/male-01/v1/thumb.webp",
      contentVersion: 1,
    });
    expect(items[0]).not.toHaveProperty("modelKey");
  });
});

describe("nhân vật", () => {
  it("tạo nhân vật rồi hasCharacter=true trong /auth/me; lần hai trả CHARACTER_ALREADY_EXISTS", async () => {
    const cookie = await loginAs(h, A);
    const avatar = await insertAvatar(t, "male-01");
    const created = await h.send(
      "POST",
      "/api/v1/player/characters",
      { avatarId: avatar, appearanceConfig: { outfitColor: "#ff8800" } },
      { cookie },
    );
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      avatarId: avatar,
      appearanceConfig: { outfitColor: "#ff8800" },
    });

    expect((await h.get("/api/v1/auth/me", { cookie })).json().user.hasCharacter).toBe(true);
    expect((await h.get("/api/v1/player/characters", { cookie })).json().items).toHaveLength(1);

    const again = await h.send(
      "POST",
      "/api/v1/player/characters",
      { avatarId: avatar },
      { cookie },
    );
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("CHARACTER_ALREADY_EXISTS");
  });

  it("không chọn được avatar đang tắt hoặc không tồn tại", async () => {
    const cookie = await loginAs(h, A);
    const off = await insertAvatar(t, "male-off", false);
    for (const avatarId of [off, "0190f3a0-0000-7000-8000-000000000000"]) {
      const res = await h.send("POST", "/api/v1/player/characters", { avatarId }, { cookie });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details[0]).toEqual({
        path: "avatarId",
        issue: "avatar_unavailable",
      });
    }
    expect((await h.get("/api/v1/player/characters", { cookie })).json().items).toHaveLength(0);
  });

  it("appearanceConfig: từ chối khóa lạ, màu sai, hoặc quá lớn", async () => {
    const cookie = await loginAs(h, A);
    const avatar = await insertAvatar(t, "male-01");
    for (const appearanceConfig of [
      { hack: 1 },
      { skinTone: "red" },
      { hairColor: "#12345" },
      "x".repeat(3000),
    ]) {
      const res = await h.send(
        "POST",
        "/api/v1/player/characters",
        { avatarId: avatar, appearanceConfig },
        { cookie },
      );
      expect(res.statusCode, JSON.stringify(appearanceConfig).slice(0, 40)).toBe(400);
    }
  });

  it("PATCH đổi avatar và cấu hình; avatar tắt bị từ chối", async () => {
    const cookie = await loginAs(h, A);
    const a1 = await insertAvatar(t, "male-01");
    const a2 = await insertAvatar(t, "male-02");
    const off = await insertAvatar(t, "male-03", false);
    const id = (
      await h.send("POST", "/api/v1/player/characters", { avatarId: a1 }, { cookie })
    ).json().id as string;

    const ok = await h.send(
      "PATCH",
      `/api/v1/player/characters/${id}`,
      { avatarId: a2, appearanceConfig: { hairColor: "#000000" } },
      { cookie },
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ avatarId: a2, appearanceConfig: { hairColor: "#000000" } });
    expect(
      (await h.send("PATCH", `/api/v1/player/characters/${id}`, { avatarId: off }, { cookie }))
        .statusCode,
    ).toBe(400);
    expect(
      (await h.send("PATCH", `/api/v1/player/characters/${id}`, {}, { cookie })).statusCode,
    ).toBe(400);
  });

  it("người dùng A không sửa được nhân vật của B (404, không đổi dữ liệu)", async () => {
    const ca = await loginAs(h, A);
    const cb = await loginAs(h, B);
    const a1 = await insertAvatar(t, "male-01");
    const a2 = await insertAvatar(t, "male-02");
    const idB = (
      await h.send("POST", "/api/v1/player/characters", { avatarId: a1 }, { cookie: cb })
    ).json().id as string;

    const res = await h.send(
      "PATCH",
      `/api/v1/player/characters/${idB}`,
      { avatarId: a2 },
      { cookie: ca },
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(
      (await h.get("/api/v1/player/characters", { cookie: cb })).json().items[0].avatarId,
    ).toBe(a1);
    expect((await h.get("/api/v1/player/characters", { cookie: ca })).json().items).toEqual([]);
  });

  it("id không phải UUID bị từ chối", async () => {
    const cookie = await loginAs(h, A);
    expect(
      (await h.send("PATCH", "/api/v1/player/characters/not-a-uuid", { bio: 1 }, { cookie }))
        .statusCode,
    ).toBe(400);
  });
});

describe("tiến trình", () => {
  it("trả giá trị rỗng khi chưa có, rồi phản ánh dữ liệu", async () => {
    const cookie = await loginAs(h, A);
    expect((await h.get("/api/v1/player/progress", { cookie })).json()).toEqual({
      lastZoneId: null,
      lastLandmarkId: null,
      lastLocalX: null,
      lastLocalZ: null,
      discoveries: [],
    });
    const { rows } = await t.pool.query("select id from users");
    await t.pool.query(
      "insert into player_progress (user_id, last_local_x, last_local_z) values ($1, 12.5, -3)",
      [rows[0].id],
    );
    expect((await h.get("/api/v1/player/progress", { cookie })).json()).toMatchObject({
      lastLocalX: 12.5,
      lastLocalZ: -3,
    });
  });
});
