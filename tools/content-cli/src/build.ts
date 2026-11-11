import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { Logger } from "@gltf-transform/core";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import {
  characterManifestSchema,
  landmarkManifestSchema,
  mediaManifestSchema,
  propManifestSchema,
  vehicleManifestSchema,
  type ContentKind,
} from "@dnw/schemas";
import { createIO } from "./glb/inspect";
import { discover, exists, KIND_LAYOUT, readJson, type ContentItem } from "./paths";
import { validateContent } from "./validate";

export interface CatalogEntry {
  kind: Exclude<ContentKind, "zone">;
  id: string;
  version: number;
  hash8: string;
  /** Thư mục trên object storage, ví dụ `characters/male-01/v1-ab12cd34`. */
  prefix: string;
  files: {
    model: string;
    thumbnail?: string;
    lod1?: string;
    cover?: string;
    lods?: string[];
    media?: string[];
  };
}

export interface Catalog {
  schemaVersion: 1;
  items: CatalogEntry[];
}

export class ContentValidationError extends Error {
  constructor(readonly issues: { kind: string; id: string; code: string; message: string }[]) {
    super(`Content không hợp lệ (${issues.length} lỗi); chạy content:validate để xem chi tiết`);
  }
}

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

interface OutFile {
  /** Đường dẫn tương đối trong thư mục phiên bản. */
  name: string;
  data: Uint8Array;
}

async function optimizeGlb(
  source: string,
  io: Awaited<ReturnType<typeof createIO>>,
): Promise<Uint8Array> {
  await MeshoptEncoder.ready;
  const doc = await io.read(source);
  doc.setLogger(new Logger(Logger.Verbosity.SILENT));
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  return io.writeBinary(doc);
}

async function toWebp(source: string, maxSize: number): Promise<Uint8Array> {
  return sharp(source)
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

async function collect(
  item: ContentItem,
  io: Awaited<ReturnType<typeof createIO>>,
): Promise<
  { version: number; id: string; files: OutFile[]; roles: CatalogEntry["files"] } | undefined
> {
  const glb = (rel: string) => optimizeGlb(join(item.dir, rel), io);
  switch (item.kind) {
    case "character": {
      const m = characterManifestSchema.parse(item.raw);
      return {
        id: m.id,
        version: m.version,
        files: [
          { name: "model.glb", data: await glb(m.model) },
          { name: "thumbnail.webp", data: await toWebp(join(item.dir, m.thumbnail), 512) },
        ],
        roles: { model: "model.glb", thumbnail: "thumbnail.webp" },
      };
    }
    case "vehicle": {
      const m = vehicleManifestSchema.parse(item.raw);
      const files: OutFile[] = [
        { name: "model.glb", data: await glb(m.model) },
        { name: "thumbnail.webp", data: await toWebp(join(item.dir, m.thumbnail), 512) },
      ];
      const roles: CatalogEntry["files"] = { model: "model.glb", thumbnail: "thumbnail.webp" };
      if (m.lod1) {
        files.push({ name: "model.lod1.glb", data: await glb(m.lod1) });
        roles.lod1 = "model.lod1.glb";
      }
      return { id: m.id, version: m.version, files, roles };
    }
    case "landmark": {
      const m = landmarkManifestSchema.parse(item.raw);
      const files: OutFile[] = [{ name: "model.glb", data: await glb(m.model) }];
      const roles: CatalogEntry["files"] = { model: "model.glb", lods: [], media: [] };
      for (const [i, lod] of m.lods.entries()) {
        files.push({ name: `lod${i + 1}.glb`, data: await glb(lod.file) });
        roles.lods!.push(`lod${i + 1}.glb`);
      }
      const mediaPath = join(item.dir, "media", "media.json");
      if (await exists(mediaPath)) {
        for (const entry of mediaManifestSchema.parse(await readJson(mediaPath)).items) {
          const name = `media/${entry.file.replace(/\.[^.]+$/, "")}.webp`;
          files.push({ name, data: await toWebp(join(item.dir, "media", entry.file), 2048) });
          roles.media!.push(name);
          if (m.cover === `media/${entry.file}`) roles.cover = name;
        }
      }
      return { id: m.code, version: m.version, files, roles };
    }
    case "prop": {
      const m = propManifestSchema.parse(item.raw);
      return {
        id: m.id,
        version: m.version,
        files: [{ name: "model.glb", data: await glb(m.model) }],
        roles: { model: "model.glb" },
      };
    }
    case "zone":
      return undefined;
  }
}

/** Tối ưu và ghi `dist/content/` theo bố cục 16.6; thất bại nếu content không hợp lệ. */
export async function buildContent(root: string, distRoot: string): Promise<Catalog> {
  const issues = await validateContent(root);
  if (issues.length > 0) throw new ContentValidationError(issues);

  const io = await createIO();
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
  const catalog: Catalog = { schemaVersion: 1, items: [] };

  for (const item of await discover(root)) {
    const built = await collect(item, io);
    if (!built) continue;
    const ordered = [...built.files].sort((a, b) => a.name.localeCompare(b.name));
    const hash8 = sha(ordered.map((f) => `${f.name}:${sha(f.data)}`).join("\n")).slice(0, 8);
    const prefix = `${KIND_LAYOUT[item.kind].dir}/${built.id}/v${built.version}-${hash8}`;
    for (const f of ordered) {
      const out = join(distRoot, prefix, f.name);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, f.data);
    }
    const key = (name?: string) => (name ? `${prefix}/${name}` : undefined);
    const r = built.roles;
    catalog.items.push({
      kind: item.kind as CatalogEntry["kind"],
      id: built.id,
      version: built.version,
      hash8,
      prefix,
      files: {
        model: key(r.model)!,
        ...(r.thumbnail ? { thumbnail: key(r.thumbnail)! } : {}),
        ...(r.lod1 ? { lod1: key(r.lod1)! } : {}),
        ...(r.cover ? { cover: key(r.cover)! } : {}),
        ...(r.lods?.length ? { lods: r.lods.map((n) => key(n)!) } : {}),
        ...(r.media?.length ? { media: r.media.map((n) => key(n)!) } : {}),
      },
    });
  }

  const uiDir = join(root, "ui");
  if (await exists(uiDir)) {
    const hash8 = await hashDir(uiDir);
    await cp(uiDir, join(distRoot, "ui", `v${hash8}`), { recursive: true });
  }

  await writeFile(join(distRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

async function hashDir(dir: string): Promise<string> {
  const h = createHash("sha256");
  const walk = async (d: string) => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else h.update(relative(dir, p)).update(await readFile(p));
    }
  };
  await walk(dir);
  return h.digest("hex").slice(0, 8);
}

export async function readCatalog(distRoot: string): Promise<Catalog> {
  const path = join(distRoot, "catalog.json");
  if (!(await exists(path)))
    throw new Error("Chưa có dist/content/catalog.json; chạy content:build trước");
  return (await readJson(path)) as Catalog;
}
