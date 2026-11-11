import { join } from "node:path";
import sharp from "sharp";
import {
  characterManifestSchema,
  landmarkI18nSchema,
  landmarkManifestSchema,
  mediaManifestSchema,
  propManifestSchema,
  REQUIRED_CLIPS,
  rigManifestSchema,
  spawnPointsFileSchema,
  vehicleManifestSchema,
  vehicleSpawnsFileSchema,
  zoneManifestSchema,
  type CharacterManifest,
  type ContentKind,
  type LandmarkManifest,
  type PropManifest,
  type VehicleManifest,
  type ZoneManifest,
} from "@dnw/schemas";
import type { z } from "zod";
import { extractPolygons, pointInPolygons } from "./geo";
import { createIO, inspectGlb, type GlbInfo } from "./glb/inspect";
import { discover, exists, KIND_LAYOUT, readJson, type ContentItem } from "./paths";

export interface Issue {
  kind: ContentKind;
  id: string;
  code: string;
  message: string;
}

/** Ngân sách theo mục 16.11. */
export const BUDGETS = {
  character: { triangles: 15_000, materials: 2, texture: 1024, bytes: 1.5 * 1024 * 1024 },
  vehicle: {
    triangles: { bicycle: 3_000, motorbike: 6_000, car: 10_000 },
    bytes: { bicycle: 600 * 1024, motorbike: 600 * 1024, car: 1024 * 1024 },
    materials: 3,
    lod1Ratio: 0.4,
    dimensionTolerance: 0.1,
  },
  landmark: { triangles: 60_000, bytes: 3 * 1024 * 1024, texture: 2048 },
  prop: { triangles: 5_000, bytes: 300 * 1024 },
} as const;

const WHEELS = {
  bicycle: ["wheel_front", "wheel_rear"],
  motorbike: ["wheel_front", "wheel_rear"],
  car: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"],
} as const;

export interface ValidateOptions {
  kind?: ContentKind | undefined;
  id?: string | undefined;
}

type Report = (code: string, message: string) => void;

function parse<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  report: Report,
): z.infer<T> | undefined {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    const path = issue.path.join(".");
    const code = path === "license" || path.startsWith("license.") ? "LICENSE_MISSING" : "SCHEMA";
    report(code, `${path || "(gốc)"}: ${issue.message}`);
  }
  return undefined;
}

async function readJsonFile(
  path: string,
  report: Report,
  label: string,
): Promise<unknown | undefined> {
  if (!(await exists(path))) {
    report("FILE_MISSING", `thiếu ${label}`);
    return undefined;
  }
  try {
    return await readJson(path);
  } catch (e) {
    report("SCHEMA", `${label}: JSON hỏng (${(e as Error).message})`);
    return undefined;
  }
}

async function requireFile(
  dir: string,
  rel: string,
  report: Report,
  label = rel,
): Promise<boolean> {
  if (await exists(join(dir, rel))) return true;
  report("FILE_MISSING", `thiếu file ${label}`);
  return false;
}

async function checkThumbnail(dir: string, rel: string, report: Report): Promise<void> {
  if (!(await requireFile(dir, rel, report))) return;
  try {
    await sharp(join(dir, rel)).metadata();
  } catch {
    report("FILE_INVALID", `thumbnail ${rel} không đọc được như ảnh`);
  }
}

async function loadGlb(
  dir: string,
  rel: string,
  io: Awaited<ReturnType<typeof createIO>>,
  report: Report,
): Promise<GlbInfo | undefined> {
  if (!(await requireFile(dir, rel, report))) return undefined;
  try {
    return await inspectGlb(join(dir, rel), io);
  } catch (e) {
    report("GLB_INVALID", `${rel} không phải glTF hợp lệ (${(e as Error).message})`);
    return undefined;
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function checkBudget(
  report: Report,
  label: string,
  glb: GlbInfo,
  budget: { triangles: number; bytes: number },
) {
  if (glb.triangles > budget.triangles) {
    report("BUDGET_TRIANGLES", `${label}: ${glb.triangles} tam giác, tối đa ${budget.triangles}`);
  }
  if (glb.sizeBytes > budget.bytes)
    report("BUDGET_SIZE", `${label}: ${mb(glb.sizeBytes)}, tối đa ${mb(budget.bytes)}`);
}

export interface ZoneIndex {
  manifest: ZoneManifest;
  polygons: ReturnType<typeof extractPolygons>;
}

async function loadZones(items: ContentItem[]): Promise<Map<string, ZoneIndex>> {
  const zones = new Map<string, ZoneIndex>();
  for (const item of items.filter((i) => i.kind === "zone")) {
    const m = zoneManifestSchema.safeParse(item.raw);
    if (!m.success) continue;
    try {
      const polygons = extractPolygons(await readJson(join(item.dir, m.data.boundary)));
      zones.set(m.data.code, { manifest: m.data, polygons });
    } catch {
      // lỗi file biên được báo khi kiểm tra chính zone đó
    }
  }
  return zones;
}

/** Kiểm tra toàn bộ content (hoặc một phần theo bộ lọc); trả danh sách lỗi rỗng nếu hợp lệ. */
export async function validateContent(
  root: string,
  options: ValidateOptions = {},
): Promise<Issue[]> {
  const all = await discover(root);
  const targets = options.kind || options.id ? await discover(root, options) : all;
  const issues: Issue[] = [];
  const io = await createIO();
  const zones = await loadZones(all);
  const vehicleIds = new Set(all.filter((i) => i.kind === "vehicle").map((i) => i.dirName));

  const rigCache = new Map<string, z.infer<typeof rigManifestSchema> | null>();
  const loadRig = async (id: string) => {
    if (!rigCache.has(id)) {
      const path = join(root, "shared", "rigs", `${id}.json`);
      rigCache.set(id, (await exists(path)) ? rigManifestSchema.parse(await readJson(path)) : null);
    }
    return rigCache.get(id)!;
  };

  // `id` trùng giữa các thư mục cùng loại
  const targetPaths = new Set(targets.map((t) => t.manifestPath));
  const seen = new Map<string, string>();
  for (const item of all) {
    const raw = item.raw as Record<string, unknown> | undefined;
    const id = raw?.[KIND_LAYOUT[item.kind].idField];
    if (typeof id !== "string") continue;
    const key = `${item.kind}:${id}`;
    const prev = seen.get(key);
    if (prev !== undefined && prev !== item.dirName) {
      if (targetPaths.has(item.manifestPath))
        issues.push({
          kind: item.kind,
          id: item.dirName,
          code: "ID_DUPLICATE",
          message: `id "${id}" trùng với thư mục ${prev}`,
        });
    }
    seen.set(key, item.dirName);
  }

  for (const item of targets) {
    const report: Report = (code, message) =>
      issues.push({ kind: item.kind, id: item.dirName, code, message });
    if (item.readError) {
      report("FILE_MISSING", item.readError);
      continue;
    }
    const idField = KIND_LAYOUT[item.kind].idField;
    const declaredId = (item.raw as Record<string, unknown>)[idField];
    if (declaredId !== item.dirName)
      report("ID_MISMATCH", `thư mục "${item.dirName}" khác ${idField} "${String(declaredId)}"`);

    switch (item.kind) {
      case "character": {
        const m = parse(characterManifestSchema, item.raw, report);
        if (m) await checkCharacter(item, m, io, report, loadRig);
        break;
      }
      case "vehicle": {
        const m = parse(vehicleManifestSchema, item.raw, report);
        if (m) await checkVehicle(item, m, io, report);
        break;
      }
      case "landmark": {
        const m = parse(landmarkManifestSchema, item.raw, report);
        if (m) await checkLandmark(item, m, io, report, zones);
        break;
      }
      case "zone": {
        const m = parse(zoneManifestSchema, item.raw, report);
        if (m) await checkZone(item, m, report, zones.get(m.code), vehicleIds);
        break;
      }
      case "prop": {
        const m = parse(propManifestSchema, item.raw, report);
        if (m) await checkProp(item, m, io, report);
        break;
      }
    }
  }
  return issues;
}

async function checkCharacter(
  item: ContentItem,
  m: CharacterManifest,
  io: Awaited<ReturnType<typeof createIO>>,
  report: Report,
  loadRig: (id: string) => Promise<z.infer<typeof rigManifestSchema> | null>,
) {
  await checkThumbnail(item.dir, m.thumbnail, report);
  for (const clip of REQUIRED_CLIPS)
    if (!m.clips[clip]) report("CLIP_MISSING", `manifest thiếu clip "${clip}"`);
  const rig = await loadRig(m.rig);
  if (!rig) report("RIG_MISSING", `không có content/shared/rigs/${m.rig}.json`);

  const glb = await loadGlb(item.dir, m.model, io, report);
  if (!glb) return;
  const b = BUDGETS.character;
  checkBudget(report, m.model, glb, { triangles: b.triangles, bytes: b.bytes });
  if (glb.materialCount > b.materials)
    report("BUDGET_MATERIALS", `${glb.materialCount} material, tối đa ${b.materials}`);
  for (const [w, h] of glb.textureSizes)
    if (Math.max(w, h) > b.texture)
      report("BUDGET_TEXTURE", `texture ${w}x${h}, tối đa ${b.texture}`);
  if (glb.hasLightsOrCameras) report("GLB_INVALID", "không được nhúng đèn hoặc camera");
  if (rig) {
    if (glb.jointCount > rig.maxBones)
      report("BUDGET_BONES", `${glb.jointCount} xương, tối đa ${rig.maxBones}`);
    for (const bone of rig.bones)
      if (!glb.jointNames.has(bone)) report("BONE_MISSING", `thiếu xương "${bone}" của ${rig.id}`);
  }
  for (const [key, animation] of Object.entries(m.clips)) {
    if (!glb.animationNames.has(animation))
      report("CLIP_MISSING", `clip "${key}" trỏ tới animation "${animation}" không có trong GLB`);
  }
  if (glb.size[1] < 1.5 || glb.size[1] > 1.9)
    report("DIMENSIONS_MISMATCH", `chiều cao ${glb.size[1].toFixed(2)} m, cần 1.5--1.9 m`);
  if (Math.abs(glb.minY) > 0.05)
    report("DIMENSIONS_MISMATCH", `gốc phải ở chân (y thấp nhất = ${glb.minY.toFixed(2)})`);
}

async function checkVehicle(
  item: ContentItem,
  m: VehicleManifest,
  io: Awaited<ReturnType<typeof createIO>>,
  report: Report,
) {
  await checkThumbnail(item.dir, m.thumbnail, report);
  const glb = await loadGlb(item.dir, m.model, io, report);
  const b = BUDGETS.vehicle;
  const required = ["body", ...m.seats.map((s) => s.socket)];
  const expectedWheels = [...WHEELS[m.kind]];
  if (JSON.stringify(m.nodes.wheels) !== JSON.stringify(expectedWheels)) {
    report("NODE_MISSING", `nodes.wheels của ${m.kind} phải là ${expectedWheels.join(", ")}`);
  }
  required.push(...m.nodes.wheels);
  if (m.nodes.steer) required.push(m.nodes.steer);

  if (glb) {
    checkBudget(report, m.model, glb, { triangles: b.triangles[m.kind], bytes: b.bytes[m.kind] });
    if (glb.materialCount > b.materials)
      report("BUDGET_MATERIALS", `${glb.materialCount} material, tối đa ${b.materials}`);
    for (const node of new Set(required))
      if (!glb.nodeNames.has(node)) report("NODE_MISSING", `GLB thiếu node "${node}"`);
    const [w, h, l] = [glb.size[0], glb.size[1], glb.size[2]];
    const tol = b.dimensionTolerance;
    for (const [name, actual, expected] of [
      ["length", l, m.dimensions.length],
      ["width", w, m.dimensions.width],
      ["height", h, m.dimensions.height],
    ] as const) {
      if (Math.abs(actual - expected) > expected * tol) {
        report(
          "DIMENSIONS_MISMATCH",
          `${name} thực ${actual.toFixed(2)} m khác manifest ${expected} m quá ${tol * 100}%`,
        );
      }
    }
    if (glb.hasLightsOrCameras) report("GLB_INVALID", "không được nhúng đèn hoặc camera");

    if (m.lod1) {
      const lod = await loadGlb(item.dir, m.lod1, io, report);
      if (lod && lod.triangles > glb.triangles * b.lod1Ratio) {
        report(
          "BUDGET_TRIANGLES",
          `${m.lod1}: ${lod.triangles} tam giác, tối đa ${Math.floor(glb.triangles * b.lod1Ratio)} (40% bản chính)`,
        );
      }
    }
  }
}

async function checkLandmark(
  item: ContentItem,
  m: LandmarkManifest,
  io: Awaited<ReturnType<typeof createIO>>,
  report: Report,
  zones: Map<string, ZoneIndex>,
) {
  const zone = zones.get(m.zone);
  if (!zone) report("ZONE_MISSING", `zone "${m.zone}" không tồn tại trong content/maps`);
  else if (!pointInPolygons(m.location.lon, m.location.lat, zone.polygons)) {
    report(
      "OUTSIDE_ZONE",
      `vị trí (${m.location.lon}, ${m.location.lat}) nằm ngoài biên zone "${m.zone}"`,
    );
  }

  const glb = await loadGlb(item.dir, m.model, io, report);
  let totalTriangles = glb?.triangles ?? 0;
  if (glb) {
    if (glb.sizeBytes > BUDGETS.landmark.bytes)
      report(
        "BUDGET_SIZE",
        `${m.model}: ${mb(glb.sizeBytes)}, tối đa ${mb(BUDGETS.landmark.bytes)}`,
      );
    for (const [w, h] of glb.textureSizes)
      if (Math.max(w, h) > BUDGETS.landmark.texture)
        report("BUDGET_TEXTURE", `texture ${w}x${h}, tối đa ${BUDGETS.landmark.texture}`);
  }
  for (const lod of m.lods) {
    const info = await loadGlb(item.dir, lod.file, io, report);
    if (info) totalTriangles += info.triangles;
  }
  if (totalTriangles > BUDGETS.landmark.triangles)
    report(
      "BUDGET_TRIANGLES",
      `tổng ${totalTriangles} tam giác (các LOD), tối đa ${BUDGETS.landmark.triangles}`,
    );

  if (m.cover) await requireFile(item.dir, m.cover, report);

  for (const locale of ["vi", "en"] as const) {
    const raw = await readJsonFile(
      join(item.dir, "i18n", `${locale}.json`),
      (c, msg) => (locale === "vi" || c !== "FILE_MISSING") && report(c, msg),
      `i18n/${locale}.json`,
    );
    if (raw !== undefined)
      parse(landmarkI18nSchema, raw, (c, msg) => report(c, `i18n/${locale}.json ${msg}`));
  }
  const mediaPath = join(item.dir, "media", "media.json");
  if (await exists(mediaPath)) {
    const media = parse(mediaManifestSchema, await readJson(mediaPath), (c, msg) =>
      report(c, `media/media.json ${msg}`),
    );
    for (const entry of media?.items ?? [])
      await requireFile(item.dir, join("media", entry.file), report, `media/${entry.file}`);
  }
}

async function checkZone(
  item: ContentItem,
  m: ZoneManifest,
  report: Report,
  zone: ZoneIndex | undefined,
  vehicleIds: Set<string>,
) {
  if (!(await requireFile(item.dir, m.boundary, report))) return;
  const polygons = zone?.polygons ?? [];
  if (polygons.length === 0) report("SCHEMA", `${m.boundary} không chứa Polygon/MultiPolygon`);
  else if (!pointInPolygons(m.origin.lon, m.origin.lat, polygons))
    report("OUTSIDE_ZONE", "origin nằm ngoài biên của chính zone");

  const spawnsRaw = await readSpawns(item.dir, "spawn_points.json", report);
  const sp =
    spawnsRaw === undefined
      ? undefined
      : parse(spawnPointsFileSchema, spawnsRaw, (c, msg) => report(c, `spawn_points.json ${msg}`));
  if (sp) {
    if (sp.spawns.length === 0) report("SCHEMA", "spawn_points.json cần ít nhất 1 điểm");
    for (const s of sp.spawns)
      if (polygons.length && !pointInPolygons(s.lon, s.lat, polygons))
        report("OUTSIDE_ZONE", `spawn "${s.id}" nằm ngoài biên zone`);
  }
  const vsRaw = await readSpawns(item.dir, "vehicle_spawns.json", report);
  const vs =
    vsRaw === undefined
      ? undefined
      : parse(vehicleSpawnsFileSchema, vsRaw, (c, msg) => report(c, `vehicle_spawns.json ${msg}`));
  if (vs) {
    const ids = new Set<string>();
    for (const s of vs.spawns) {
      if (ids.has(s.id)) report("ID_DUPLICATE", `vehicle_spawns.json trùng id "${s.id}"`);
      ids.add(s.id);
      if (!vehicleIds.has(s.vehicle))
        report("VEHICLE_REF_MISSING", `spawn "${s.id}" dùng xe "${s.vehicle}" không tồn tại`);
      if (polygons.length && !pointInPolygons(s.lon, s.lat, polygons))
        report("OUTSIDE_ZONE", `vehicle spawn "${s.id}" nằm ngoài biên zone`);
    }
  }
}

async function readSpawns(dir: string, file: string, report: Report): Promise<unknown | undefined> {
  return readJsonFile(join(dir, file), report, file);
}

async function checkProp(
  item: ContentItem,
  m: PropManifest,
  io: Awaited<ReturnType<typeof createIO>>,
  report: Report,
) {
  const glb = await loadGlb(item.dir, m.model, io, report);
  if (glb) checkBudget(report, m.model, glb, BUDGETS.prop);
}
