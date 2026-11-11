import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  spawnPoints,
  vehicleSpawnPoints,
  vehicleTypes,
  worldZones,
  type Database,
} from "@dnw/db";
import { COLLISION_CELL_SIZE_M, type VehicleKind } from "@dnw/game-config";
import {
  SANDBOX_PLAYER_SPAWNS,
  SANDBOX_VEHICLE_SPAWNS,
  SANDBOX_ZONE_CODE,
  SurfaceMap,
  buildSandboxWorld,
  createCollisionWorld,
  decodeSurfaceGrid,
  pointInMultiPolygon,
  toLocal,
  type Polygon,
  type Segment,
  type SandboxWorld,
  type VehicleSpawnSpec,
} from "@dnw/game-core";
import { chunkManifestSchema, collisionFileSchema, zoneIndexSchema } from "@dnw/schemas";

/** Thế giới của một zone: dữ liệu va chạm, bề mặt, biên và điểm xuất hiện. Dùng chung giữa các room cùng `mapVersion`. */
export interface ZoneRuntime {
  code: string;
  mapVersion: number;
  world: Pick<SandboxWorld, "collision" | "inBounds" | "surfaceAt">;
  playerSpawns: readonly { x: number; z: number; rotY: number }[];
  vehicleSpawns: readonly VehicleSpawnSpec[];
}

export interface ZoneProvider {
  /** `undefined` nếu zone không tồn tại, không `active` hoặc chưa có bản đồ. */
  get(zoneCode: string): Promise<ZoneRuntime | undefined>;
}

/** Zone `sandbox` cục bộ (dev/test), không cần DB hay bản đồ. */
export class SandboxZoneProvider implements ZoneProvider {
  private runtime: ZoneRuntime | undefined;

  async get(zoneCode: string) {
    if (zoneCode !== SANDBOX_ZONE_CODE) return undefined;
    this.runtime ??= {
      code: SANDBOX_ZONE_CODE,
      mapVersion: 1,
      world: buildSandboxWorld(),
      playerSpawns: SANDBOX_PLAYER_SPAWNS,
      vehicleSpawns: SANDBOX_VEHICLE_SPAWNS,
    };
    return this.runtime;
  }
}

/** Đọc tệp bản đồ từ CDN (http/https) hoặc từ thư mục cục bộ chứa `zones/<zone>/v<N>/...`. */
export interface MapSource {
  read(path: string): Promise<Uint8Array>;
}

export function createMapSource(base: string, fetchFn: typeof fetch = fetch): MapSource {
  if (/^https?:\/\//.test(base)) {
    const root = base.replace(/\/+$/, "");
    return {
      async read(path) {
        const res = await fetchFn(`${root}/${path}`);
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      },
    };
  }
  // Đường dẫn tương đối tính từ gốc repo để chạy từ thư mục nào cũng được.
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const dir = resolve(repoRoot, base);
  return { read: async (path) => new Uint8Array(await readFile(join(dir, path))) };
}

interface Boundary {
  coordinates: [number, number][][][];
}

export interface MapGeometry {
  collision: ReturnType<typeof createCollisionWorld>;
  surfaceAt: SurfaceMap["surfaceAt"];
  chunkSizeM: number;
  segments: readonly Segment[];
}

/** Nạp `collision.json` và `surface.bin` của mọi chunk thuộc `zones/<zone>/v<N>` (mục 16.9). */
export async function loadMapGeometry(source: MapSource, prefix: string): Promise<MapGeometry> {
  const json = async <T>(path: string, parse: (v: unknown) => T): Promise<T> =>
    parse(JSON.parse(new TextDecoder().decode(await source.read(`${prefix}/${path}`))));

  const index = await json("index.json", (v) => zoneIndexSchema.parse(v));
  const surfaces = new SurfaceMap(index.chunkSizeM);
  const segments: Segment[] = [];
  await Promise.all(
    index.chunks.map(async (entry) => {
      const manifest = await json(entry.manifest, (v) => chunkManifestSchema.parse(v));
      const dir = entry.manifest.slice(0, entry.manifest.lastIndexOf("/") + 1);
      const [collisionJson, surfaceBytes] = await Promise.all([
        json(dir + manifest.collision.url, (v) => collisionFileSchema.parse(v)),
        source.read(`${prefix}/${dir}${manifest.surface.url}`),
      ]);
      for (const s of collisionJson.segments) segments.push([s[0] / 100, s[1] / 100, s[2] / 100, s[3] / 100]);
      surfaces.set(entry.gx, entry.gz, decodeSurfaceGrid(surfaceBytes));
    }),
  );
  return {
    collision: createCollisionWorld(segments, COLLISION_CELL_SIZE_M),
    surfaceAt: surfaces.surfaceAt,
    chunkSizeM: index.chunkSizeM,
    segments,
  };
}

/** Đọc bản đồ thật của zone `active`; cache theo (zone, mapVersion). */
export class DbZoneProvider implements ZoneProvider {
  private readonly cache = new Map<string, Promise<ZoneRuntime>>();

  constructor(
    private readonly db: Database,
    private readonly source: MapSource,
  ) {}

  async get(zoneCode: string) {
    const [zone] = await this.db
      .select()
      .from(worldZones)
      .where(and(eq(worldZones.code, zoneCode), eq(worldZones.status, "active")));
    if (!zone || zone.mapVersion <= 0) return undefined;

    const key = `${zone.code}@${zone.mapVersion}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.load(zone).catch((e) => {
        this.cache.delete(key);
        throw e;
      });
      this.cache.set(key, pending);
    }
    return pending;
  }

  private async load(zone: typeof worldZones.$inferSelect): Promise<ZoneRuntime> {
    const prefix = `zones/${zone.code}/v${zone.mapVersion}`;
    const geometry = await loadMapGeometry(this.source, prefix);

    const origin = { lon: zone.originLon, lat: zone.originLat };
    const boundary = (zone.boundary as unknown as Boundary).coordinates.map(
      (poly): Polygon => poly.map((ring) => ring.map(([lon, lat]) => {
        const p = toLocal(origin, lon, lat);
        return [p.x, p.z] as const;
      })),
    );

    const spawns = await this.db
      .select({ x: spawnPoints.localX, z: spawnPoints.localZ, rotY: spawnPoints.rotationY })
      .from(spawnPoints)
      .where(and(eq(spawnPoints.zoneId, zone.id), eq(spawnPoints.isActive, true)));
    const vehicles = await this.db
      .select({ code: vehicleSpawnPoints.code, kind: vehicleTypes.kind, x: vehicleSpawnPoints.localX, z: vehicleSpawnPoints.localZ, rotY: vehicleSpawnPoints.headingY })
      .from(vehicleSpawnPoints)
      .innerJoin(vehicleTypes, eq(vehicleTypes.id, vehicleSpawnPoints.vehicleTypeId))
      .where(and(eq(vehicleSpawnPoints.zoneId, zone.id), eq(vehicleSpawnPoints.isActive, true), eq(vehicleTypes.isActive, true)));

    return {
      code: zone.code,
      mapVersion: zone.mapVersion,
      world: {
        collision: geometry.collision,
        inBounds: (x, z) => pointInMultiPolygon(x, z, boundary),
        surfaceAt: geometry.surfaceAt,
      },
      playerSpawns: spawns,
      vehicleSpawns: vehicles.map((v) => ({ id: v.code, kind: v.kind as VehicleKind, x: v.x, z: v.z, rotY: v.rotY })),
    };
  }
}

/** Zone sandbox khi cho phép ticket dev; mọi zone khác đi qua nhà cung cấp thật. */
export class CompositeZoneProvider implements ZoneProvider {
  constructor(private readonly providers: readonly ZoneProvider[]) {}

  async get(zoneCode: string) {
    for (const p of this.providers) {
      const r = await p.get(zoneCode);
      if (r) return r;
    }
    return undefined;
  }
}
