import { VEHICLE_KINDS } from "@dnw/schemas";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, inList, pk, point, updatedAt } from "./common";
import { worldZones } from "./world";

export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: pk(),
    code: varchar("code", { length: 80 }).notNull().unique(),
    kind: varchar("kind", { length: 20 }).notNull(),
    modelKey: text("model_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    contentVersion: integer("content_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("vehicle_types_kind_check", inList("kind", VEHICLE_KINDS))],
);

export const vehicleSpawnPoints = pgTable(
  "vehicle_spawn_points",
  {
    id: pk(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => worldZones.id, { onDelete: "cascade" }),
    vehicleTypeId: uuid("vehicle_type_id")
      .notNull()
      .references(() => vehicleTypes.id),
    code: varchar("code", { length: 80 }).notNull(),
    position: point("position").notNull(),
    localX: real("local_x").notNull(),
    localZ: real("local_z").notNull(),
    headingY: real("heading_y").notNull().default(0),
    respawnSeconds: integer("respawn_seconds").notNull().default(120),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("vehicle_spawn_points_zone_id_code_key").on(t.zoneId, t.code),
    check("vehicle_spawn_points_respawn_check", sql`${t.respawnSeconds} >= 30`),
    index("vehicle_spawn_points_zone_idx")
      .on(t.zoneId)
      .where(sql`${t.isActive}`),
  ],
);
