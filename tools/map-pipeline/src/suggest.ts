import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { extractPolygons, pointInPolygons } from "@dnw/content-cli/geo";
import { readJson } from "@dnw/content-cli/paths";
import { VEHICLE_KIND_WEIGHTS, MAX_VEHICLES_PER_ROOM } from "@dnw/game-config";
import { createProjector } from "@dnw/game-core";
import { spawnPointsFileSchema, zoneManifestSchema } from "@dnw/schemas";
import { extractFeatures, type RoadFeature } from "./osm";
import { hashString, rng } from "./palette";

const ELIGIBLE = new Set(["residential", "tertiary", "secondary", "primary"]);
const OFFSET_M = 1.5;
const MIN_SPACING_M = 40;
const MIN_CLEARANCE_M = 15;
const CAR_MIN_ROAD_WIDTH = 6;

export interface SuggestedSpawn {
  id: string;
  vehicle: string;
  lon: number;
  lat: number;
  headingDeg: number;
  respawnSeconds: number;
}

type Pt = [number, number];

/** Hướng la bàn (0 = Bắc = -Z, 90 = Đông = +X) của vectơ local. */
export const bearingDeg = (dx: number, dz: number) =>
  ((((Math.atan2(dx, -dz) * 180) / Math.PI) % 360) + 360) % 360;

/** Đề xuất điểm đậu xe theo mục 16.8 từ đường OSM; người duyệt chỉnh lại trước khi commit. */
export function suggestVehicleSpawns(
  roads: RoadFeature[],
  playerSpawns: Pt[],
  zoneCode: string,
  maxCount = MAX_VEHICLES_PER_ROOM,
): { x: number; z: number; headingDeg: number; vehicle: string }[] {
  // Giao lộ: điểm đầu/cuối hoặc đỉnh được ≥ 2 đường cùng dùng
  const usage = new Map<string, number>();
  const key = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  for (const r of roads)
    for (const p of new Set(r.line.map(key))) usage.set(p, (usage.get(p) ?? 0) + 1);
  const junctions: Pt[] = [];
  for (const r of roads)
    for (const p of r.line) if ((usage.get(key(p)) ?? 0) >= 2) junctions.push(p);

  const rand = rng(hashString(`vehicle-spawns:${zoneCode}`));
  const picked: { x: number; z: number; headingDeg: number; vehicle: string }[] = [];
  const far = (x: number, z: number, pts: readonly Pt[], d: number) =>
    pts.every((p) => Math.hypot(p[0] - x, p[1] - z) >= d);

  const candidates = roads
    .filter((r) => ELIGIBLE.has(r.highway) && !r.bridge)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const road of candidates) {
    for (let i = 0; i < road.line.length - 1; i++) {
      const [x0, z0] = road.line[i]!;
      const [x1, z1] = road.line[i + 1]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const ux = (x1 - x0) / len,
        uz = (z1 - z0) / len;
      for (let s = MIN_CLEARANCE_M; s <= len - MIN_CLEARANCE_M; s += MIN_SPACING_M) {
        if (picked.length >= maxCount) return picked;
        // Lệch phải so với chiều đi (vuông góc), song song đường
        const x = x0 + ux * s + -uz * OFFSET_M,
          z = z0 + uz * s + ux * OFFSET_M;
        if (!far(x, z, junctions, MIN_CLEARANCE_M) || !far(x, z, playerSpawns, MIN_CLEARANCE_M))
          continue;
        if (
          !far(
            x,
            z,
            picked.map((p) => [p.x, p.z] as Pt),
            MIN_SPACING_M,
          )
        )
          continue;
        const roll = rand();
        let vehicle =
          roll < VEHICLE_KIND_WEIGHTS.motorbike
            ? "motorbike-01"
            : roll < VEHICLE_KIND_WEIGHTS.motorbike + VEHICLE_KIND_WEIGHTS.bicycle
              ? "bicycle-01"
              : "car-01";
        if (vehicle === "car-01" && road.width < CAR_MIN_ROAD_WIDTH) vehicle = "motorbike-01";
        picked.push({
          x: Math.round(x * 100) / 100,
          z: Math.round(z * 100) / 100,
          headingDeg: Math.round(bearingDeg(ux, uz)),
          vehicle,
        });
      }
    }
  }
  return picked;
}

export async function writeSuggestedSpawns(
  contentRoot: string,
  zone: string,
  rawPath: string,
  max?: number,
): Promise<number> {
  const zoneDir = join(contentRoot, "maps", zone);
  const manifest = zoneManifestSchema.parse(await readJson(join(zoneDir, "zone.json")));
  const features = extractFeatures(await readJson(rawPath), manifest.origin);
  const projector = createProjector(manifest.origin);
  const players = spawnPointsFileSchema
    .parse(await readJson(join(zoneDir, "spawn_points.json")))
    .spawns.map((s) => {
      const p = projector.toLocal(s.lon, s.lat);
      return [p.x, p.z] as Pt;
    });
  const boundary = extractPolygons(await readJson(join(zoneDir, manifest.boundary)));
  // OSM tải kèm lề 30 m ngoài biên: bỏ điểm nằm ngoài biên zone (validator sẽ từ chối)
  const inside = (s: { x: number; z: number }) => {
    const g = projector.toGeo(s.x, s.z);
    return pointInPolygons(g.lon, g.lat, boundary);
  };
  const spawns = suggestVehicleSpawns(features.roads, players, zone, 400)
    .filter(inside)
    .slice(0, max ?? MAX_VEHICLES_PER_ROOM)
    .map((s, i): SuggestedSpawn => {
      const g = projector.toGeo(s.x, s.z);
      return {
        id: `vs-${String(i + 1).padStart(3, "0")}`,
        vehicle: s.vehicle,
        lon: Math.round(g.lon * 1e7) / 1e7,
        lat: Math.round(g.lat * 1e7) / 1e7,
        headingDeg: s.headingDeg,
        respawnSeconds: 120,
      };
    });
  await writeFile(
    join(zoneDir, "vehicle_spawns.json"),
    `${JSON.stringify({ schemaVersion: 1, spawns }, null, 2)}\n`,
  );
  return spawns.length;
}
