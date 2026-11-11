import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabase } from "@dnw/db/testing";
import {
  cookieFrom,
  createHarness,
  createSeededDatabase,
  tokenFromMail,
  type TestHarness,
} from "../../test-helpers";

const PASSWORD = "correct horse battery";
const registerBody = (over: Record<string, unknown> = {}) => ({
  email: "minh@example.com",
  password: PASSWORD,
  displayName: "Minh",
  locale: "vi",
  acceptTerms: true,
  ...over,
});

let t: TestDatabase;
let h: TestHarness;
let strict: TestHarness;

beforeAll(async () => {
  t = await createSeededDatabase();
  h = await createHarness(t);
  strict = await createHarness(t, { REQUIRE_EMAIL_VERIFICATION: "true" });
}, 240_000);

afterAll(async () => {
  await h?.close();
  await strict?.close();
  await t?.drop();
}, 60_000);

beforeEach(async () => {
  await h.reset();
  await strict.reset();
});

async function registerAndLogin(harness = h, over: Record<string, unknown> = {}) {
  const body = registerBody(over);
  await harness.send("POST", "/api/v1/auth/register", body);
  if (harness === strict) {
    const token = tokenFromMail(harness.mailer, body.email as string);
    await harness.send("POST", "/api/v1/auth/verify-email", { token });
  }
  const res = await harness.send("POST", "/api/v1/auth/login", {
    email: body.email,
    password: body.password,
  });
  expect(res.statusCode).toBe(200);
  return { cookie: cookieFrom(res), body, res };
}

describe("register", () => {
  it("email mới và email đã tồn tại cho cùng phản hồi, khác nhau ở thư gửi đi", async () => {
    const first = await h.send("POST", "/api/v1/auth/register", registerBody());
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "verification_sent" });
    expect(h.mailer.outbox).toHaveLength(1);
    expect(h.mailer.last()?.subject).toMatch(/Xác minh/);

    const second = await h.send(
      "POST",
      "/api/v1/auth/register",
      registerBody({ displayName: "Khác Tên" }),
    );
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.json()).toEqual(first.json());
    expect(h.mailer.outbox).toHaveLength(2);
    expect(h.mailer.last()?.subject).toMatch(/đã có tài khoản/);

    const { rows } = await t.pool.query("select count(*)::int n from users");
    expect(rows[0].n).toBe(1);
  });

  it("tạo user, hồ sơ, vai trò player và terms_accepted_at", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody({ email: "A@Example.COM" }));
    const { rows } = await t.pool.query(
      `select u.email, u.status, u.terms_accepted_at, p.display_name, p.display_name_key, p.locale,
              (select string_agg(r.code, ',') from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id) roles
       from users u join user_profiles p on p.user_id = u.id`,
    );
    expect(rows[0]).toMatchObject({
      email: "a@example.com",
      status: "active",
      display_name: "Minh",
      display_name_key: "minh",
      locale: "vi",
      roles: "player",
    });
    expect(rows[0].terms_accepted_at).not.toBeNull();
  });

  it("từ chối khi thiếu acceptTerms, mật khẩu ngắn/phổ biến, email sai; kèm requestId", async () => {
    for (const over of [
      { acceptTerms: false },
      { acceptTerms: undefined },
      { password: "short" },
      { password: "password123" },
      { email: "not-an-email" },
      { displayName: "a" },
    ]) {
      const res = await h.send("POST", "/api/v1/auth/register", registerBody(over));
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
      const err = res.json().error;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.requestId).toBe(res.headers["x-request-id"]);
      expect(err.details.length).toBeGreaterThan(0);
    }
  });

  it("tên hiển thị trùng (không phân biệt dấu) trả 409", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody({ displayName: "Ânh" }));
    const res = await h.send(
      "POST",
      "/api/v1/auth/register",
      registerBody({ email: "other@example.com", displayName: "Anh" }),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT_DISPLAY_NAME_TAKEN");
  });

  it("bật xác minh email thì user ở trạng thái pending", async () => {
    await strict.send("POST", "/api/v1/auth/register", registerBody());
    const { rows } = await t.pool.query("select status from users");
    expect(rows[0].status).toBe("pending");
  });
});

describe("login và session", () => {
  it("đặt cookie đúng cờ và trả user", async () => {
    const { res } = await registerAndLogin();
    const raw = String(res.headers["set-cookie"]);
    expect(raw).toMatch(/^dnw_sid=[A-Za-z0-9_-]{43};/);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//);
    expect(raw).toMatch(/Max-Age=2592000/);
    expect(raw).not.toMatch(/Secure/i);
    expect(res.json().user).toMatchObject({
      displayName: "Minh",
      locale: "vi",
      roles: ["player"],
      permissions: [],
      hasCharacter: false,
    });
  });

  it("có cờ Secure khi APP_BASE_URL là https", async () => {
    const secure = await createHarness(t, { APP_BASE_URL: "https://dnw.example.com" });
    try {
      await secure.reset();
      const origin = { origin: "https://dnw.example.com" };
      await secure.send("POST", "/api/v1/auth/register", registerBody(), { headers: origin });
      const res = await secure.send(
        "POST",
        "/api/v1/auth/login",
        { email: "minh@example.com", password: PASSWORD },
        { headers: origin },
      );
      expect(String(res.headers["set-cookie"])).toMatch(/Secure/);
    } finally {
      await secure.close();
      await h.reset();
    }
  });

  it("DB chỉ lưu SHA-256 của token, không lưu token", async () => {
    const { cookie } = await registerAndLogin();
    const token = cookie.split("=")[1]!;
    const { rows } = await t.pool.query(
      "select token_hash, ip_hash, expires_at from auth_sessions",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
    const days = (new Date(rows[0].expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("sai mật khẩu và sai email cho cùng một lỗi", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody());
    const wrongPw = await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: "nope-nope-nope",
    });
    const wrongEmail = await h.send("POST", "/api/v1/auth/login", {
      email: "nobody@example.com",
      password: "nope-nope-nope",
    });
    expect(wrongPw.statusCode).toBe(401);
    expect(wrongEmail.statusCode).toBe(401);
    expect(wrongPw.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(wrongEmail.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(wrongPw.json().error.message).toBe(wrongEmail.json().error.message);
  });

  it("tài khoản bị khóa: chỉ lộ khi đúng mật khẩu", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody());
    await t.pool.query("update users set status = 'suspended'");
    const wrong = await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: "nope-nope-nope",
    });
    expect(wrong.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
    const right = await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: PASSWORD,
    });
    expect(right.statusCode).toBe(403);
    expect(right.json().error.code).toBe("AUTH_ACCOUNT_SUSPENDED");
    await t.pool.query("update users set status = 'banned'");
    expect(
      (
        await h.send("POST", "/api/v1/auth/login", {
          email: "minh@example.com",
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("yêu cầu xác minh email khi REQUIRE_EMAIL_VERIFICATION=true", async () => {
    await strict.send("POST", "/api/v1/auth/register", registerBody());
    const res = await strict.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_EMAIL_NOT_VERIFIED");

    const token = tokenFromMail(strict.mailer, "minh@example.com");
    expect((await strict.send("POST", "/api/v1/auth/verify-email", { token })).statusCode).toBe(
      200,
    );
    const ok = await strict.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: PASSWORD,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.emailVerified).toBe(true);
  });

  it("/auth/me: chưa đăng nhập 401, đã đăng nhập trả user", async () => {
    expect((await h.get("/api/v1/auth/me")).statusCode).toBe(401);
    expect((await h.get("/api/v1/auth/me", { cookie: "dnw_sid=garbage" })).json().error.code).toBe(
      "UNAUTHENTICATED",
    );
    const { cookie } = await registerAndLogin();
    const res = await h.get("/api/v1/auth/me", { cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe("Minh");
  });

  it("logout thu hồi session và xóa cookie", async () => {
    const { cookie } = await registerAndLogin();
    const out = await h.send("POST", "/api/v1/auth/logout", undefined, { cookie });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers["set-cookie"])).toMatch(/dnw_sid=;/);
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(401);
    const { rows } = await t.pool.query("select revoked_at from auth_sessions");
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it("session hết hạn tuyệt đối hoặc quá hạn trượt thì bị từ chối", async () => {
    const { cookie } = await registerAndLogin();
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(200);

    await t.pool.query("update auth_sessions set expires_at = now() - interval '1 minute'");
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(401);

    await t.pool.query(
      "update auth_sessions set expires_at = now() + interval '1 day', last_seen_at = now() - interval '15 days'",
    );
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(401);

    await t.pool.query("update auth_sessions set last_seen_at = now() - interval '13 days'");
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(200);
  });

  it("last_seen_at chỉ cập nhật khi đã quá 5 phút", async () => {
    const { cookie } = await registerAndLogin();
    await t.pool.query("update auth_sessions set last_seen_at = now() - interval '1 minute'");
    const before = (await t.pool.query("select last_seen_at from auth_sessions")).rows[0]
      .last_seen_at as Date;
    await h.get("/api/v1/auth/me", { cookie });
    const same = (await t.pool.query("select last_seen_at from auth_sessions")).rows[0]
      .last_seen_at as Date;
    expect(same.getTime()).toBe(before.getTime());

    await t.pool.query("update auth_sessions set last_seen_at = now() - interval '10 minutes'");
    const old = (await t.pool.query("select last_seen_at from auth_sessions")).rows[0]
      .last_seen_at as Date;
    await h.get("/api/v1/auth/me", { cookie });
    const touched = (await t.pool.query("select last_seen_at from auth_sessions")).rows[0]
      .last_seen_at as Date;
    expect(touched.getTime()).toBeGreaterThan(old.getTime() + 9 * 60_000);
  });

  it("tài khoản bị khóa sau khi đăng nhập thì session không còn dùng được", async () => {
    const { cookie } = await registerAndLogin();
    await t.pool.query("update users set status = 'suspended'");
    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(401);
  });
});

describe("token email", () => {
  it("verify-email dùng một lần; lần hai bị từ chối", async () => {
    await strict.send("POST", "/api/v1/auth/register", registerBody());
    const token = tokenFromMail(strict.mailer, "minh@example.com");
    const first = await strict.send("POST", "/api/v1/auth/verify-email", { token });
    expect(first.statusCode).toBe(200);
    const second = await strict.send("POST", "/api/v1/auth/verify-email", { token });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.code).toBe("TOKEN_INVALID");
    const { rows } = await t.pool.query("select status, email_verified_at from users");
    expect(rows[0].status).toBe("active");
    expect(rows[0].email_verified_at).not.toBeNull();
  });

  it("token hết hạn, sai loại hoặc bịa đều bị từ chối; DB lưu hash", async () => {
    await strict.send("POST", "/api/v1/auth/register", registerBody());
    const token = tokenFromMail(strict.mailer, "minh@example.com");
    const { rows } = await t.pool.query("select token_hash from email_tokens");
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toContain(token);

    await t.pool.query("update email_tokens set expires_at = now() - interval '1 second'");
    expect(
      (await strict.send("POST", "/api/v1/auth/verify-email", { token })).json().error.code,
    ).toBe("TOKEN_INVALID");
    expect(
      (await strict.send("POST", "/api/v1/auth/verify-email", { token: "x".repeat(43) })).json()
        .error.code,
    ).toBe("TOKEN_INVALID");
    // token xác minh không dùng được để đặt lại mật khẩu
    const reset = await strict.send("POST", "/api/v1/auth/reset-password", {
      token,
      password: "another long password",
    });
    expect(reset.statusCode).toBe(400);
  });

  it("hạn của token: 24 giờ (xác minh) và 1 giờ (đặt lại)", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody());
    await h.send("POST", "/api/v1/auth/forgot-password", { email: "minh@example.com" });
    const { rows } = await t.pool.query(
      "select type, extract(epoch from (expires_at - created_at))::int secs from email_tokens order by type",
    );
    expect(rows).toEqual([
      { type: "reset_password", secs: 3600 },
      { type: "verify_email", secs: 86_400 },
    ]);
  });

  it("resend-verification luôn 202; chỉ gửi thư cho tài khoản chưa xác minh", async () => {
    await strict.send("POST", "/api/v1/auth/register", registerBody());
    strict.mailer.outbox.length = 0;
    const known = await strict.send("POST", "/api/v1/auth/resend-verification", {
      email: "minh@example.com",
    });
    const unknown = await strict.send("POST", "/api/v1/auth/resend-verification", {
      email: "ghost@example.com",
    });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(strict.mailer.outbox.map((m) => m.to)).toEqual(["minh@example.com"]);
    // token cũ bị vô hiệu khi cấp token mới
    const fresh = tokenFromMail(strict.mailer, "minh@example.com");
    expect(
      (await strict.send("POST", "/api/v1/auth/verify-email", { token: fresh })).statusCode,
    ).toBe(200);
    strict.mailer.outbox.length = 0;
    await strict.send("POST", "/api/v1/auth/resend-verification", { email: "minh@example.com" });
    expect(strict.mailer.outbox).toHaveLength(0);
  });
});

describe("đặt lại và đổi mật khẩu", () => {
  it("forgot-password luôn 202, không lộ email; reset thu hồi mọi session", async () => {
    const { cookie } = await registerAndLogin();
    h.mailer.outbox.length = 0;
    const known = await h.send("POST", "/api/v1/auth/forgot-password", {
      email: "minh@example.com",
    });
    const unknown = await h.send("POST", "/api/v1/auth/forgot-password", {
      email: "ghost@example.com",
    });
    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(h.mailer.outbox).toHaveLength(1);

    const token = tokenFromMail(h.mailer, "minh@example.com");
    const newPassword = "a brand new password";
    const reset = await h.send("POST", "/api/v1/auth/reset-password", {
      token,
      password: newPassword,
    });
    expect(reset.statusCode).toBe(200);

    expect((await h.get("/api/v1/auth/me", { cookie })).statusCode).toBe(401);
    const old = await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: PASSWORD,
    });
    expect(old.statusCode).toBe(401);
    const fresh = await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: newPassword,
    });
    expect(fresh.statusCode).toBe(200);

    const again = await h.send("POST", "/api/v1/auth/reset-password", {
      token,
      password: "yet another password",
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe("TOKEN_INVALID");
  });

  it("reset từ chối mật khẩu yếu mà không tiêu token", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody());
    await h.send("POST", "/api/v1/auth/forgot-password", { email: "minh@example.com" });
    const token = tokenFromMail(h.mailer, "minh@example.com");
    expect(
      (await h.send("POST", "/api/v1/auth/reset-password", { token, password: "short" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await h.send("POST", "/api/v1/auth/reset-password", {
          token,
          password: "a brand new password",
        })
      ).statusCode,
    ).toBe(200);
  });

  it("reset hết hạn bị từ chối", async () => {
    await h.send("POST", "/api/v1/auth/register", registerBody());
    await h.send("POST", "/api/v1/auth/forgot-password", { email: "minh@example.com" });
    const token = tokenFromMail(h.mailer, "minh@example.com");
    await t.pool.query(
      "update email_tokens set expires_at = now() - interval '1 second' where type = 'reset_password'",
    );
    const res = await h.send("POST", "/api/v1/auth/reset-password", {
      token,
      password: "a brand new password",
    });
    expect(res.json().error.code).toBe("TOKEN_INVALID");
  });

  it("đổi mật khẩu thu hồi session khác, giữ session hiện tại", async () => {
    const { cookie: a } = await registerAndLogin();
    const b = cookieFrom(
      await h.send("POST", "/api/v1/auth/login", { email: "minh@example.com", password: PASSWORD }),
    );

    const wrong = await h.send(
      "POST",
      "/api/v1/auth/change-password",
      { currentPassword: "wrong-wrong-1", newPassword: "a brand new password" },
      { cookie: a },
    );
    expect(wrong.statusCode).toBe(401);

    const ok = await h.send(
      "POST",
      "/api/v1/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "a brand new password" },
      { cookie: a },
    );
    expect(ok.statusCode).toBe(200);
    expect((await h.get("/api/v1/auth/me", { cookie: a })).statusCode).toBe(200);
    expect((await h.get("/api/v1/auth/me", { cookie: b })).statusCode).toBe(401);
    expect(
      (
        await h.send("POST", "/api/v1/auth/change-password", {
          currentPassword: "x",
          newPassword: "a brand new password",
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe("CSRF", () => {
  it("POST thiếu header X-DNW-CSRF hoặc Origin sai thì 403 CSRF_REJECTED", async () => {
    const body = registerBody();
    const cases: Record<string, Record<string, string>> = {
      "thiếu X-DNW-CSRF": { origin: "http://localhost:3000" },
      "thiếu Origin": { "x-dnw-csrf": "1" },
      "Origin sai": { origin: "https://evil.example.com", "x-dnw-csrf": "1" },
      "CSRF sai giá trị": { origin: "http://localhost:3000", "x-dnw-csrf": "0" },
    };
    for (const [name, headers] of Object.entries(cases)) {
      const res = await h.app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: body,
        headers,
        remoteAddress: "10.0.0.9",
      });
      expect(res.statusCode, name).toBe(403);
      expect(res.json().error.code, name).toBe("CSRF_REJECTED");
    }
    const { rows } = await t.pool.query("select count(*)::int n from users");
    expect(rows[0].n).toBe(0);
  });

  it("GET không cần header CSRF", async () => {
    expect((await h.get("/api/v1/auth/me")).statusCode).toBe(401);
  });
});

describe("rate limit", () => {
  it("login: quá 10 lần/15 phút cho cùng IP+email thì 429 RATE_LIMITED", async () => {
    const body = { email: "minh@example.com", password: "wrong-password-1" };
    for (let i = 0; i < 10; i++) {
      expect((await h.send("POST", "/api/v1/auth/login", body)).statusCode).toBe(401);
    }
    const blocked = await h.send("POST", "/api/v1/auth/login", body);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // email khác vẫn dùng được chung IP
    const other = await h.send("POST", "/api/v1/auth/login", {
      ...body,
      email: "other@example.com",
    });
    expect(other.statusCode).toBe(401);
  });

  it("login: quá 50 lần/15 phút từ một IP thì 429 dù đổi email", async () => {
    for (let i = 0; i < 50; i++) {
      await h.send("POST", "/api/v1/auth/login", {
        email: `u${i}@example.com`,
        password: "wrong-password-1",
      });
    }
    const res = await h.send("POST", "/api/v1/auth/login", {
      email: "late@example.com",
      password: "wrong-password-1",
    });
    expect(res.statusCode).toBe(429);
  }, 120_000);

  it("register: quá 5 lần/giờ/IP thì 429", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await h.send(
        "POST",
        "/api/v1/auth/register",
        registerBody({ email: `r${i}@example.com`, displayName: `Người ${i}ab` }),
      );
      expect(res.statusCode).toBe(202);
    }
    const res = await h.send(
      "POST",
      "/api/v1/auth/register",
      registerBody({ email: "r9@example.com", displayName: "Người 9ab" }),
    );
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("forgot-password: 3 lần/giờ/email", async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        (await h.send("POST", "/api/v1/auth/forgot-password", { email: "same@example.com" }))
          .statusCode,
      ).toBe(202);
    }
    expect(
      (await h.send("POST", "/api/v1/auth/forgot-password", { email: "same@example.com" }))
        .statusCode,
    ).toBe(429);
  });

  it("mặc định 120 yêu cầu/phút/IP", async () => {
    for (let i = 0; i < 120; i++) await h.get("/api/v1/nope", { ip: "10.9.9.9" });
    expect((await h.get("/api/v1/nope", { ip: "10.9.9.9" })).statusCode).toBe(429);
    expect((await h.get("/api/v1/nope", { ip: "10.9.9.8" })).statusCode).toBe(404);
    expect((await h.get("/healthz", { ip: "10.9.9.9" })).statusCode).toBe(200);
  });
});

describe("nền tảng", () => {
  it("healthz và readyz", async () => {
    expect((await h.get("/healthz")).json()).toEqual({ status: "ok" });
    const ready = await h.get("/readyz");
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready", db: true, redis: true });
  });

  it("404 dùng định dạng lỗi chuẩn; x-request-id được giữ nếu hợp lệ", async () => {
    const res = await h.get("/api/v1/nothing", { headers: { "x-request-id": "abc-123" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: "NOT_FOUND", requestId: "abc-123" });
    expect(res.headers["x-request-id"]).toBe("abc-123");

    const bad = await h.get("/api/v1/nothing", {
      headers: { "x-request-id": "bad id\twith space" },
    });
    expect(bad.headers["x-request-id"]).not.toBe("bad id\twith space");
    expect(String(bad.headers["x-request-id"])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("body quá 100 KB bị từ chối 413", async () => {
    const res = await h.send("POST", "/api/v1/auth/login", {
      email: "a@b.co",
      password: "x".repeat(120_000),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("JSON hỏng trả 400 và không rò rỉ chi tiết nội bộ", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: "{bad json",
      headers: {
        origin: "http://localhost:3000",
        "x-dnw-csrf": "1",
        "content-type": "application/json",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("có header bảo mật của helmet và no-store", async () => {
    const res = await h.get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("log", () => {
  it("không chứa mật khẩu, token email, cookie phiên hay token đặt lại", async () => {
    const { cookie } = await registerAndLogin();
    const sessionToken = cookie.split("=")[1]!;
    await h.send("POST", "/api/v1/auth/forgot-password", { email: "minh@example.com" });
    const resetToken = tokenFromMail(h.mailer, "minh@example.com");
    await h.get("/api/v1/auth/me", { cookie });
    await h.send("POST", "/api/v1/auth/login", {
      email: "minh@example.com",
      password: "wrong-password-xyz",
    });
    await h.send("POST", "/api/v1/auth/reset-password", {
      token: resetToken,
      password: "brand-new-secret-pass",
    });

    const text = h.logs.join("\n");
    expect(text.length).toBeGreaterThan(100);
    for (const secret of [
      PASSWORD,
      "wrong-password-xyz",
      "brand-new-secret-pass",
      sessionToken,
      resetToken,
    ]) {
      expect(text, `log không được chứa ${secret.slice(0, 6)}...`).not.toContain(secret);
    }
    expect(text).not.toMatch(/set-cookie/i);
  });
});
