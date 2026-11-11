import { GENDERS } from "@dnw/schemas";
import { boolean, check, integer, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./account";
import { createdAt, inList, pk, updatedAt } from "./common";

export const avatars = pgTable(
  "avatars",
  {
    id: pk(),
    code: varchar("code", { length: 80 }).notNull().unique(),
    gender: varchar("gender", { length: 20 }).notNull(),
    rig: varchar("rig", { length: 50 }).notNull(),
    modelKey: text("model_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull(),
    animationSet: varchar("animation_set", { length: 100 }).notNull(),
    contentVersion: integer("content_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("avatars_gender_check", inList("gender", GENDERS))],
);

export const playerCharacters = pgTable("player_characters", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  avatarId: uuid("avatar_id")
    .notNull()
    .references(() => avatars.id),
  characterName: varchar("character_name", { length: 32 }),
  appearanceConfig: jsonb("appearance_config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
