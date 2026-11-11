import { ROOM_STATUSES } from "@dnw/schemas";
import { check, index, integer, pgTable, real, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./account";
import { createdAt, inList, pk, tz, updatedAt } from "./common";
import { landmarks } from "./landmark";
import { worldZones } from "./world";

export const gameRooms = pgTable(
  "game_rooms",
  {
    id: pk(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => worldZones.id),
    roomCode: varchar("room_code", { length: 100 }).notNull().unique(),
    capacity: integer("capacity").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    serverInstance: varchar("server_instance", { length: 100 }).notNull(),
    peakPlayers: integer("peak_players").notNull().default(0),
    createdAt: createdAt(),
    closedAt: tz("closed_at"),
  },
  (t) => [
    check("game_rooms_status_check", inList("status", ROOM_STATUSES)),
    index("game_rooms_status_zone_idx").on(t.status, t.zoneId),
  ],
);

export const playerDiscoveries = pgTable(
  "player_discoveries",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    landmarkId: uuid("landmark_id")
      .notNull()
      .references(() => landmarks.id, { onDelete: "cascade" }),
    discoveredAt: tz("discovered_at").notNull().defaultNow(),
  },
  (t) => [unique("player_discoveries_user_id_landmark_id_key").on(t.userId, t.landmarkId)],
);

export const playerProgress = pgTable("player_progress", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastZoneId: uuid("last_zone_id").references(() => worldZones.id, { onDelete: "set null" }),
  lastLandmarkId: uuid("last_landmark_id").references(() => landmarks.id, { onDelete: "set null" }),
  lastLocalX: real("last_local_x"),
  lastLocalZ: real("last_local_z"),
  updatedAt: updatedAt(),
});
