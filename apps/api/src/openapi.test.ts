import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateOpenApi } from "./openapi";
import { OPENAPI_PATH } from "./openapi-path";

describe("OpenAPI", () => {
  it("docs/api/openapi.json khớp với route hiện tại (chạy `pnpm --filter @dnw/api openapi` để cập nhật)", async () => {
    const committed = await readFile(OPENAPI_PATH, "utf8");
    expect(await generateOpenApi()).toBe(committed);
  });

  it("mô tả các endpoint xác thực và định dạng lỗi chuẩn", async () => {
    const doc = JSON.parse(await generateOpenApi());
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/auth/register",
        "/auth/login",
        "/auth/logout",
        "/auth/me",
        "/auth/verify-email",
        "/auth/resend-verification",
        "/auth/forgot-password",
        "/auth/reset-password",
        "/auth/change-password",
      ]),
    );
    expect(doc.paths["/auth/login"].post.responses["429"]).toBeDefined();
  });
});
