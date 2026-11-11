import { AppError } from "../errors";

/** Từ cấm (đã chuẩn hóa bằng normalizeDisplayName). Danh sách đầy đủ do T15 nạp. */
let blocked: ReadonlySet<string> = new Set();

export function setBlockedNameTerms(terms: Iterable<string>): void {
  blocked = new Set(terms);
}

/** Điểm móc kiểm tra tên hiển thị; `key` là `display_name_key`. */
export function assertDisplayNameAllowed(key: string): void {
  for (const term of blocked) {
    if (key.includes(term)) {
      throw new AppError("VALIDATION_ERROR", 400, "Invalid input", [
        { path: "displayName", issue: "name_not_allowed" },
      ]);
    }
  }
}
