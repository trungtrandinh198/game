import { describe, expect, it } from "vitest";
import { displayNameSchema, normalizeDisplayName } from "./display-name";

describe("normalizeDisplayName", () => {
  it("bỏ dấu, đ thành d, chữ thường", () => {
    expect(normalizeDisplayName("Ân")).toBe("an");
    expect(normalizeDisplayName("Đà Nẵng")).toBe("da nang");
    expect(normalizeDisplayName("ĐỖ Văn_Tùng")).toBe("do van_tung");
  });

  it("Ân và An cùng khóa", () => {
    expect(normalizeDisplayName("Ân")).toBe(normalizeDisplayName("AN"));
  });

  it("gộp khoảng trắng và áp dụng NFKC (chữ full-width)", () => {
    expect(normalizeDisplayName("  Hải   Châu ")).toBe("hai chau");
    expect(normalizeDisplayName("ＡＢＣ")).toBe("abc");
  });

  it("xử lý dạng tổ hợp (NFD) giống dạng dựng sẵn", () => {
    expect(normalizeDisplayName("A\u0302n")).toBe(normalizeDisplayName("Ân"));
  });
});

describe("displayNameSchema", () => {
  it("chấp nhận tên hợp lệ và chuẩn hóa khoảng trắng", () => {
    expect(displayNameSchema.parse("  Nguyễn  An ")).toBe("Nguyễn An");
    expect(displayNameSchema.parse("an_01.x-y")).toBe("an_01.x-y");
  });

  it("từ chối tên ngắn, dài, hoặc ký tự lạ", () => {
    expect(displayNameSchema.safeParse("ab").success).toBe(false);
    expect(displayNameSchema.safeParse("a".repeat(33)).success).toBe(false);
    expect(displayNameSchema.safeParse("an<script>").success).toBe(false);
    expect(displayNameSchema.safeParse("an😀x").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("độ dài tính sau khi cắt khoảng trắng ở hai đầu", () => {
    expect(displayNameSchema.safeParse(" ab ").success).toBe(false);
    expect(displayNameSchema.safeParse("abc").success).toBe(true);
  });
});
