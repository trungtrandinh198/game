import { worldZones } from "@dnw/db";
import type { Database } from "@dnw/db";
import { and, asc, eq } from "drizzle-orm";

const columns = {
  id: worldZones.id,
  code: worldZones.code,
  name: worldZones.name,
  originLon: worldZones.originLon,
  originLat: worldZones.originLat,
  crs: worldZones.crs,
  chunkSizeM: worldZones.chunkSizeM,
  status: worldZones.status,
  mapVersion: worldZones.mapVersion,
};

/** Zone đang mở và đã có bản đồ publish (`map_version > 0`). */
export async function listOpenZones(db: Database) {
  const rows = await db
    .select(columns)
    .from(worldZones)
    .where(eq(worldZones.status, "active"))
    .orderBy(asc(worldZones.code));
  return rows.filter((r) => r.mapVersion > 0);
}

export async function findOpenZone(db: Database, code: string) {
  const [row] = await db
    .select(columns)
    .from(worldZones)
    .where(and(eq(worldZones.code, code), eq(worldZones.status, "active")));
  return row && row.mapVersion > 0 ? row : undefined;
}
