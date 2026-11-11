import { VEHICLE_DEFAULTS } from "@dnw/game-config";
import { toGeo } from "@dnw/game-core";
import { count, eq } from "drizzle-orm";
import type { Database } from "../client";
import {
  avatars,
  landmarkCategories,
  permissions,
  rolePermissions,
  roles,
  spawnPoints,
  vehicleTypes,
  worldZones,
} from "../schema";
import { LANDMARK_CATEGORY_CODES, PERMISSION_DEFS, ROLE_DEFS, ROLE_PERMISSIONS } from "./data";

export interface SeedOptions {
  /** Thêm dữ liệu placeholder cho môi trường dev (zone, spawn, nhân vật, xe). */
  dev?: boolean;
}

const DEV_ZONE = { code: "han-river-core", name: "Han River Core", lon: 108.2272, lat: 16.0612 };
const DEV_HALF_EXTENT_M = 250;

/** Dữ liệu nền; chạy lại nhiều lần không tạo bản ghi trùng. */
export async function seed(db: Database, options: SeedOptions = {}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(roles)
      .values([...ROLE_DEFS])
      .onConflictDoNothing({ target: roles.code });
    await tx
      .insert(permissions)
      .values([...PERMISSION_DEFS])
      .onConflictDoNothing({ target: permissions.code });
    await tx
      .insert(landmarkCategories)
      .values(LANDMARK_CATEGORY_CODES.map((code, i) => ({ code, sortOrder: i })))
      .onConflictDoNothing({ target: landmarkCategories.code });

    const roleIds = new Map(
      (await tx.select({ id: roles.id, code: roles.code }).from(roles)).map((r) => [r.code, r.id]),
    );
    const permIds = new Map(
      (await tx.select({ id: permissions.id, code: permissions.code }).from(permissions)).map(
        (p) => [p.code, p.id],
      ),
    );
    const links = Object.entries(ROLE_PERMISSIONS).flatMap(([role, codes]) =>
      codes.map((code) => ({ roleId: roleIds.get(role)!, permissionId: permIds.get(code)! })),
    );
    if (links.length > 0) await tx.insert(rolePermissions).values(links).onConflictDoNothing();

    if (options.dev) await seedDev(tx as unknown as Database);
  });
}

async function seedDev(db: Database): Promise<void> {
  const origin = { lon: DEV_ZONE.lon, lat: DEV_ZONE.lat };
  const h = DEV_HALF_EXTENT_M;
  const ring = [
    toGeo(origin, -h, -h),
    toGeo(origin, h, -h),
    toGeo(origin, h, h),
    toGeo(origin, -h, h),
    toGeo(origin, -h, -h),
  ].map((p) => [p.lon, p.lat] as [number, number]);

  await db
    .insert(worldZones)
    .values({
      code: DEV_ZONE.code,
      name: DEV_ZONE.name,
      boundary: { type: "MultiPolygon", coordinates: [[ring]] },
      originLon: DEV_ZONE.lon,
      originLat: DEV_ZONE.lat,
      status: "draft",
    })
    .onConflictDoNothing({ target: worldZones.code });

  const [zone] = await db
    .select({ id: worldZones.id })
    .from(worldZones)
    .where(eq(worldZones.code, DEV_ZONE.code));
  if (!zone) throw new Error("Không tạo được zone dev");

  const [existing] = await db
    .select({ n: count() })
    .from(spawnPoints)
    .where(eq(spawnPoints.zoneId, zone.id));
  if ((existing?.n ?? 0) === 0) {
    await db.insert(spawnPoints).values(
      [-20, 0, 20].map((x) => {
        const g = toGeo(origin, x, 4);
        return {
          zoneId: zone.id,
          position: { type: "Point" as const, coordinates: [g.lon, g.lat] as [number, number] },
          localX: x,
          localZ: 4,
        };
      }),
    );
  }

  await db
    .insert(avatars)
    .values(
      (["male", "female"] as const).map((gender, i) => ({
        code: `${gender}-01`,
        gender,
        rig: "humanoid-v1",
        modelKey: `characters/${gender}-01/v1/model.glb`,
        thumbnailKey: `characters/${gender}-01/v1/thumb.webp`,
        animationSet: "base-locomotion",
        isActive: true,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: avatars.code });

  await db
    .insert(vehicleTypes)
    .values(
      (["bicycle", "motorbike", "car"] as const).map((kind, i) => ({
        code: `${kind}-01`,
        kind,
        modelKey: `vehicles/${kind}-01/v1/model.glb`,
        thumbnailKey: `vehicles/${kind}-01/v1/thumb.webp`,
        config: VEHICLE_DEFAULTS[kind] as unknown as Record<string, unknown>,
        isActive: true,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: vehicleTypes.code });
}
