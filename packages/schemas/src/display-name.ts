import { z } from "zod";

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 32;

/** Chữ cái, chữ số, khoảng trắng, `_`, `-`, `.` (mục 7.11). */
const ALLOWED = /^[\p{L}\p{N} _.-]+$/u;

/**
 * Khóa duy nhất của tên hiển thị: NFKC, bỏ dấu, `đ` thành `d`, chữ thường, gộp khoảng trắng.
 * Ví dụ "Ân" và "An" cho cùng một khóa.
 */
export function normalizeDisplayName(name: string): string {
  return name
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tên hiển thị hợp lệ; kết quả đã bỏ khoảng trắng thừa ở hai đầu và gộp khoảng trắng liên tiếp. */
export const displayNameSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, "Tên cần ít nhất 3 ký tự")
      .max(DISPLAY_NAME_MAX, "Tên tối đa 32 ký tự")
      .regex(ALLOWED, "Tên chỉ gồm chữ cái, chữ số, khoảng trắng, _ - ."),
  );
