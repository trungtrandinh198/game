import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Thất bại nếu messages/vi.json và messages/en.json không cùng bộ khóa. Tham số tùy chọn: thư mục chứa hai file. */
function flatten(obj, prefix = "") {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

const dir = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new globalThis.URL("../messages", import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const vi = new Set(flatten(load("vi")));
const en = new Set(flatten(load("en")));

const missingInEn = [...vi].filter((k) => !en.has(k));
const missingInVi = [...en].filter((k) => !vi.has(k));

if (missingInEn.length || missingInVi.length) {
  for (const k of missingInEn) console.error(`Thiếu trong en.json: ${k}`);
  for (const k of missingInVi) console.error(`Thiếu trong vi.json: ${k}`);
  process.exit(1);
}
console.log(`i18n: ${vi.size} khóa, vi và en khớp nhau.`);
