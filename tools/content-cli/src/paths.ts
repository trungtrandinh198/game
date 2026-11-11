import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { ContentKind } from "@dnw/schemas";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export const defaultContentRoot = () =>
  process.env["DNW_CONTENT_ROOT"] ?? join(REPO_ROOT, "content");
export const defaultDistRoot = () =>
  process.env["DNW_DIST_ROOT"] ?? join(REPO_ROOT, "dist", "content");

export const KIND_LAYOUT: Record<
  ContentKind,
  { dir: string; manifest: string; idField: "id" | "code" }
> = {
  character: { dir: "characters", manifest: "character.json", idField: "id" },
  vehicle: { dir: "vehicles", manifest: "vehicle.json", idField: "id" },
  landmark: { dir: "landmarks", manifest: "landmark.json", idField: "code" },
  zone: { dir: "maps", manifest: "zone.json", idField: "code" },
  prop: { dir: "props", manifest: "prop.json", idField: "id" },
};

export interface ContentItem {
  kind: ContentKind;
  /** Tên thư mục; phải trùng `id`/`code` trong manifest. */
  dirName: string;
  dir: string;
  manifestPath: string;
  /** JSON đã đọc, hoặc `undefined` nếu thiếu/hỏng (xem `readError`). */
  raw: unknown;
  readError?: string;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Liệt kê mọi mục content theo loại; bỏ qua thư mục bắt đầu bằng `_` hoặc `.`. */
export async function discover(
  root: string,
  filter: { kind?: ContentKind | undefined; id?: string | undefined } = {},
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const [kind, layout] of Object.entries(KIND_LAYOUT) as [
    ContentKind,
    (typeof KIND_LAYOUT)[ContentKind],
  ][]) {
    if (filter.kind && filter.kind !== kind) continue;
    const base = join(root, layout.dir);
    if (!(await exists(base))) continue;
    for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith("."))
        continue;
      if (filter.id && filter.id !== entry.name) continue;
      const dir = join(base, entry.name);
      const manifestPath = join(dir, layout.manifest);
      const item: ContentItem = { kind, dirName: entry.name, dir, manifestPath, raw: undefined };
      try {
        item.raw = await readJson(manifestPath);
      } catch (e) {
        item.readError =
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? `thiếu ${layout.manifest}`
            : `JSON hỏng: ${(e as Error).message}`;
      }
      items.push(item);
    }
  }
  return items;
}
