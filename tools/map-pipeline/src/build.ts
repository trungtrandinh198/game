import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createIO, inspectGlb } from "@dnw/content-cli/glb";
import { discover, exists, readJson } from "@dnw/content-cli/paths";
import { createProjector } from "@dnw/game-core";
import {
  landmarkManifestSchema,
  mapOverridesSchema,
  zoneManifestSchema,
  type ChunkManifest,
  type ZoneIndex,
} from "@dnw/schemas";
import validator from "gltf-validator";
import { buildChunks, type ChunkOutput, type LandmarkSpec } from "./chunks";
import { cleanRing, simplifyRing, union, type MultiPoly, type Pt } from "./geom";
import { extractFeatures } from "./osm";

/** Ngân sách chunk (mục 16.10): trung bình <= 0.8 MB, tối đa 1.5 MB cho `static.glb`. */
export const CHUNK_BUDGET = { avgBytes: 0.8 * 1024 * 1024, maxBytes: 1.5 * 1024 * 1024 };

export class MapBuildError extends Error {}

export interface BuildMapOptions {
  contentRoot: string;
  zone: string;
  /** Mặc định: `<content>/maps/<zone>/raw/<zone>.osm.json`. */
  rawPath?: string;
  outDir: string;
  mapVersion: number;
  validateGlb?: boolean;
}

export interface BuildMapResult {
  index: ZoneIndex;
  chunks: ChunkOutput[];
  /** Đường dẫn gốc của bản build: `<outDir>/zones/<zone>/v<mapVersion>`. */
  root: string;
}

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export function zoneRoot(outDir: string, zone: string, mapVersion: number) {
  return join(outDir, "zones", zone, `v${mapVersion}`);
}

export async function buildMap(opts: BuildMapOptions): Promise<BuildMapResult> {
  const zoneDir = join(opts.contentRoot, "maps", opts.zone);
  if (!(await exists(join(zoneDir, "zone.json"))))
    throw new MapBuildError(`Không có content/maps/${opts.zone}/zone.json`);
  const zone = zoneManifestSchema.parse(await readJson(join(zoneDir, "zone.json")));
  const projector = createProjector(zone.origin);

  const toLocalRing = (ring: number[][]): Pt[] =>
    cleanRing(
      ring.map(([lon, lat]) => {
        const p = projector.toLocal(lon!, lat!);
        return [p.x, p.z] as Pt;
      }),
    );
  const boundaryGeo = (await readJson(join(zoneDir, zone.boundary))) as {
    type: string;
    coordinates?: number[][][] | number[][][][];
    geometry?: unknown;
  };
  const boundary = boundaryToLocal(boundaryGeo, toLocalRing);

  const rawPath = opts.rawPath ?? join(zoneDir, "raw", `${opts.zone}.osm.json`);
  if (!(await exists(rawPath)))
    throw new MapBuildError(`Chưa có dữ liệu OSM ${rawPath}; chạy map:download trước`);
  const features = extractFeatures(await readJson(rawPath), zone.origin);

  // overrides.json
  const overridesPath = join(zoneDir, "overrides.json");
  if (await exists(overridesPath)) {
    const ov = mapOverridesSchema.parse(await readJson(overridesPath));
    const removed = new Set(ov.removeFeatures);
    features.buildings = features.buildings.filter((b) => !removed.has(b.id));
    features.roads = features.roads.filter((r) => !removed.has(r.id));
    for (const o of ov.buildings) {
      for (const b of features.buildings.filter((x) => x.id === o.id)) {
        if (o.height !== undefined) b.tags["height"] = String(o.height);
        if (o.levels !== undefined) b.tags["building:levels"] = String(o.levels);
      }
    }
  }

  // landmarks thuộc zone
  const io = await createIO();
  const landmarks: LandmarkSpec[] = [];
  for (const item of (await discover(opts.contentRoot, { kind: "landmark" })).filter(
    (i) => !i.readError,
  )) {
    const m = landmarkManifestSchema.safeParse(item.raw);
    if (!m.success || m.data.zone !== opts.zone) continue;
    const glb = await inspectGlb(join(item.dir, m.data.model), io);
    const p = projector.toLocal(m.data.location.lon, m.data.location.lat);
    const hx = (glb.size[0] * m.data.scale) / 2,
      hz = (glb.size[2] * m.data.scale) / 2;
    const c = Math.cos(m.data.rotationY),
      s = Math.sin(m.data.rotationY);
    const corners: Pt[] = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ].map(([x, z]) => [p.x + x! * c + z! * s, p.z - x! * s + z! * c] as Pt);
    landmarks.push({
      code: m.data.code,
      x: p.x,
      z: p.z,
      rotationY: m.data.rotationY,
      footprint: [...corners, corners[0]!],
      replacesOsmBuildings: m.data.replacesOsmBuildings,
    });
  }
  landmarks.sort((a, b) => a.code.localeCompare(b.code));

  const chunks = await buildChunks(
    features,
    { code: opts.zone, chunkSizeM: zone.chunkSizeM, boundary },
    landmarks,
  );
  checkBudget(chunks);

  const root = zoneRoot(opts.outDir, opts.zone, opts.mapVersion);
  await rm(root, { recursive: true, force: true });
  const write = async (rel: string, data: string | Uint8Array) => {
    const path = join(root, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
  };

  const entries: ZoneIndex["chunks"] = [];
  for (const c of chunks) {
    if (opts.validateGlb !== false) await assertValidGlb(c);
    const collisionJson = json(c.collision);
    const dir = `chunks/${c.code}`;
    const glbSize = await write(`${dir}/static.glb`, c.glb);
    const colSize = await write(`${dir}/collision.json`, collisionJson);
    const surfSize = await write(`${dir}/surface.bin`, c.surface);
    const manifest: ChunkManifest = {
      schemaVersion: 1,
      code: c.code,
      bounds: c.bounds,
      glb: { url: "static.glb", sizeBytes: glbSize, sha256: sha(c.glb) },
      collision: { url: "collision.json", sizeBytes: colSize, sha256: sha(collisionJson) },
      surface: { url: "surface.bin", sizeBytes: surfSize, sha256: sha(c.surface) },
      instances: c.instances,
      landmarks: c.landmarks,
      stats: c.stats,
    };
    const manifestText = json(manifest);
    const manifestSize = await write(`${dir}/manifest.json`, manifestText);
    entries.push({
      code: c.code,
      gx: c.gx,
      gz: c.gz,
      manifest: `${dir}/manifest.json`,
      sizeBytes: glbSize + colSize + surfSize + manifestSize,
      sha256: sha(manifestText),
    });
  }

  const minX = Math.min(...chunks.map((c) => c.bounds.minX)),
    minZ = Math.min(...chunks.map((c) => c.bounds.minZ));
  const maxX = Math.max(...chunks.map((c) => c.bounds.maxX)),
    maxZ = Math.max(...chunks.map((c) => c.bounds.maxZ));
  const index: ZoneIndex = {
    schemaVersion: 1,
    zoneCode: opts.zone,
    mapVersion: opts.mapVersion,
    chunkSizeM: zone.chunkSizeM,
    crs: zone.crs,
    origin: zone.origin,
    bounds: { minX, minZ, maxX, maxZ },
    chunks: entries,
  };
  await write("index.json", json(index));
  return { index, chunks, root };
}

function boundaryToLocal(
  g: { type: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] },
  project: (r: number[][]) => Pt[],
): MultiPoly {
  const polys: MultiPoly = [];
  const visit = (x: typeof g | undefined): void => {
    if (!x) return;
    if (x.type === "Polygon")
      polys.push((x.coordinates as number[][][]).map((r) => simplifyRing(project(r), 0.01)));
    else if (x.type === "MultiPolygon")
      for (const p of x.coordinates as number[][][][])
        polys.push(p.map((r) => simplifyRing(project(r), 0.01)));
    else if (x.type === "Feature") visit(x.geometry as typeof g);
    else if (x.type === "FeatureCollection") (x.features as (typeof g)[]).forEach(visit);
  };
  visit(g);
  if (polys.length === 0) throw new MapBuildError("boundary.geojson không có Polygon");
  return union(polys);
}

function checkBudget(chunks: ChunkOutput[]): void {
  const sizes = chunks.map((c) => c.glb.byteLength);
  const tooBig = chunks.filter((c) => c.glb.byteLength > CHUNK_BUDGET.maxBytes);
  const avg = sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length);
  const problems: string[] = [];
  for (const c of tooBig)
    problems.push(`chunk ${c.code}: ${(c.glb.byteLength / 1048576).toFixed(2)} MB > 1.5 MB`);
  if (avg > CHUNK_BUDGET.avgBytes)
    problems.push(`trung bình ${(avg / 1048576).toFixed(2)} MB > 0.8 MB`);
  if (problems.length > 0)
    throw new MapBuildError(`Vượt ngân sách chunk (mục 16.10): ${problems.join("; ")}`);
}

async function assertValidGlb(c: ChunkOutput): Promise<void> {
  const report = await validator.validateBytes(c.glb, { maxIssues: 20 });
  if (report.issues.numErrors > 0) {
    const first = report.issues.messages
      .filter((m) => m.severity === 0)
      .slice(0, 3)
      .map((m) => `${m.code}: ${m.message}`)
      .join("; ");
    throw new MapBuildError(`GLB chunk ${c.code} không hợp lệ theo gltf-validator: ${first}`);
  }
}

export async function loadIndex(root: string): Promise<ZoneIndex> {
  return JSON.parse(await readFile(join(root, "index.json"), "utf8")) as ZoneIndex;
}
