import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES } from "@dnw/schemas";
import { describe, expect, it } from "vitest";
import { flattenKeys, MESSAGES } from "../i18n/config";
import { ApiError, api, apiRequest, errorMessageKey } from "./api-client";
import { registerForm } from "./forms";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("apiRequest", () => {
  it("gắn X-DNW-CSRF cho thao tác ghi và không gắn cho GET", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { status: "ok" });
    }) as unknown as typeof fetch;
    await apiRequest("/x", null, { fetchFn });
    await apiRequest("/x", null, { method: "POST", body: { a: 1 }, fetchFn });
    expect(calls[0]!.url).toBe("/api/v1/x");
    expect((calls[0]!.init.headers as Record<string, string>)["x-dnw-csrf"]).toBeUndefined();
    expect((calls[1]!.init.headers as Record<string, string>)["x-dnw-csrf"]).toBe("1");
    expect(calls[1]!.init.body).toBe('{"a":1}');
    expect(calls[1]!.init.credentials).toBe("same-origin");
  });

  it("ánh xạ lỗi chuẩn 9.6 sang ApiError", async () => {
    const fetchFn = (async () =>
      jsonResponse(401, {
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "x",
          requestId: "r1",
          details: [{ path: "email", issue: "bad" }],
        },
      })) as unknown as typeof fetch;
    const e = await apiRequest("/auth/login", null, { method: "POST", fetchFn }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      status: 401,
      requestId: "r1",
      details: [{ path: "email", issue: "bad" }],
    });
  });

  it("lỗi mạng thành NETWORK; phản hồi không phải JSON thành INTERNAL_ERROR; 204 trả undefined", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await apiRequest("/x", null, { fetchFn: down }).catch((x) => x)).toMatchObject({
      code: "NETWORK",
      status: 0,
    });

    const html = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    expect(await apiRequest("/x", null, { fetchFn: html }).catch((x) => x)).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });

    const empty = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    expect(
      await apiRequest("/auth/logout", null, { method: "POST", fetchFn: empty }),
    ).toBeUndefined();
  });

  it("api.* dùng đường dẫn /api/v1 và kiểm tra schema phản hồi", () => {
    expect(typeof api.login).toBe("function");
    expect(errorMessageKey(new ApiError("RATE_LIMITED", 429))).toBe("errors.RATE_LIMITED");
    expect(errorMessageKey(new Error("x"))).toBe("errors.INTERNAL_ERROR");
  });
});

describe("i18n", () => {
  it("vi và en có cùng bộ khóa", () => {
    expect(flattenKeys(MESSAGES.en).sort()).toEqual(flattenKeys(MESSAGES.vi).sort());
  });

  it("có chuỗi lỗi đã dịch cho mọi mã lỗi của API, ở cả hai ngôn ngữ", () => {
    for (const locale of ["vi", "en"] as const) {
      const errors = MESSAGES[locale].errors as Record<string, string>;
      for (const code of [...ERROR_CODES, "NETWORK"])
        expect(errors[code], `${locale}.${code}`).toBeTruthy();
    }
  });

  it("không có chuỗi rỗng", () => {
    for (const m of Object.values(MESSAGES)) {
      for (const key of flattenKeys(m)) {
        const value = key
          .split(".")
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], m);
        expect(String(value).length, key).toBeGreaterThan(0);
      }
    }
  });

  it("script i18n:check thất bại khi thiếu khóa ở một ngôn ngữ và đạt khi khớp", () => {
    const script = fileURLToPath(new URL("../../scripts/i18n-check.mjs", import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), "dnw-i18n-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "vi.json"), JSON.stringify({ a: { b: "1", c: "2" } }));
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: { b: "1" } }));
    const bad = spawnSync("node", [script, dir], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("Thiếu trong en.json: a.c");

    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: { b: "1", c: "2" } }));
    expect(spawnSync("node", [script, dir], { encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("node", [script], { encoding: "utf8" }).status).toBe(0);
  });
});

describe("form đăng ký", () => {
  const ok = {
    email: "a@example.com",
    password: "correct horse battery",
    displayName: "Minh An",
    acceptTerms: true,
  };

  it("hợp lệ", () => {
    expect(registerForm.safeParse(ok).success).toBe(true);
  });

  it("thông điệp lỗi là khóa i18n có thật trong cả hai ngôn ngữ", () => {
    const keys = new Set<string>();
    for (const bad of [
      { ...ok, email: "x" },
      { ...ok, password: "short" },
      { ...ok, password: "password123" },
      { ...ok, displayName: "a" },
      { ...ok, acceptTerms: false },
    ]) {
      const r = registerForm.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) for (const i of r.error.issues) keys.add(i.message);
    }
    expect([...keys].sort()).toEqual([
      "validation.email",
      "validation.nameInvalid",
      "validation.passwordCommon",
      "validation.passwordMin",
      "validation.terms",
    ]);
    for (const locale of ["vi", "en"] as const) {
      for (const key of keys) {
        const v = key
          .split(".")
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], MESSAGES[locale]);
        expect(typeof v, `${locale}.${key}`).toBe("string");
      }
    }
  });
});
