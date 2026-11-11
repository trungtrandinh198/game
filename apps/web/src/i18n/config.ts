import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";

export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export const MESSAGES = { vi, en } as const;
export type Messages = typeof vi;

/** Mọi khóa lá dạng `a.b.c` của một bộ chuỗi, dùng cho script kiểm tra hai ngôn ngữ cùng khóa. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}
