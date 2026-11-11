import { CHUNK_STATUSES, ZONE_STATUSES } from "@dnw/schemas";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  real,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, inList, multiPolygon, pk, point, polygon, updatedAt } from "./common";

export const worldZones = pgTable(
  "world_zones",
  {
    id: pk(),
    code: varchar("code", { length: 80 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    boundary: multiPolygon("boundary").notNull(),
    originLon: doublePrecision("origin_lon").notNull(),
    originLat: doublePrecision("origin_lat").notNull(),
    crs: varchar("crs", { length: 20 }).notNull().default("EPSG:32649"),
    chunkSizeM: integer("chunk_size_m").notNull().default(256),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    mapVersion: integer("map_version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("world_zones_chunk_size_check", sql`${t.chunkSizeM} BETWEEN 64 AND 1024`),
    check("world_zones_status_check", inList("status", ZONE_STATUSES)),
    index("world_zones_boundary_gix").using("gist", t.boundary),
  ],
);

export const mapChunks = pgTable(
  "map_chunks",
  {
    id: pk(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => worldZones.id, { onDelete: "cascade" }),
    chunkCode: varchar("chunk_code", { length: 40 }).notNull(),
    gridX: integer("grid_x").notNull(),
    gridZ: integer("grid_z").notNull(),
    bounds: polygon("bounds").notNull(),
    assetManifestKey: text("asset_manifest_key").notNull(),
    collisionKey: text("collision_key").notNull(),
    sizeBytes: integer("size_bytes"),
    version: integer("version").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("map_chunks_zone_id_chunk_code_version_key").on(t.zoneId, t.chunkCode, t.version),
    check("map_chunks_status_check", inList("status", CHUNK_STATUSES)),
    index("map_chunks_bounds_gix").using("gist", t.bounds),
    index("map_chunks_zone_status_idx").on(t.zoneId, t.status),
  ],
);

export const spawnPoints = pgTable(
  "spawn_points",
  {
    id: pk(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => worldZones.id, { onDelete: "cascade" }),
    position: point("position").notNull(),
    localX: real("local_x").notNull(),
    localZ: real("local_z").notNull(),
    rotationY: real("rotation_y").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    maxOccupancy: integer("max_occupancy"),
  },
  (t) => [
    index("spawn_points_zone_idx")
      .on(t.zoneId)
      .where(sql`${t.isActive}`),
  ],
);
