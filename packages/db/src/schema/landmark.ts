import { LANDMARK_STATUSES, LOCALES, MEDIA_TYPES, REVIEW_STATUSES } from "@dnw/schemas";
import { sql } from "drizzle-orm";
import {
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
import { users } from "./account";
import { createdAt, inList, pk, point, tz, updatedAt } from "./common";
import { worldZones } from "./world";

export const landmarkCategories = pgTable("landmark_categories", {
  id: pk(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  icon: varchar("icon", { length: 80 }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const landmarks = pgTable(
  "landmarks",
  {
    id: pk(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => worldZones.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => landmarkCategories.id),
    code: varchar("code", { length: 100 }).notNull().unique(),
    location: point("location").notNull(),
    localX: real("local_x").notNull(),
    localZ: real("local_z").notNull(),
    interactionRadiusM: real("interaction_radius_m").notNull().default(25),
    coverImageKey: text("cover_image_key"),
    modelKey: text("model_key"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: tz("deleted_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "landmarks_interaction_radius_check",
      sql`${t.interactionRadiusM} > 0 AND ${t.interactionRadiusM} <= 200`,
    ),
    check("landmarks_status_check", inList("status", LANDMARK_STATUSES)),
    index("landmarks_location_gix").using("gist", t.location),
    index("landmarks_location_geog_gix").using("gist", sql`((${t.location})::geography)`),
    index("landmarks_zone_status_idx")
      .on(t.zoneId, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const landmarkTranslations = pgTable(
  "landmark_translations",
  {
    id: pk(),
    landmarkId: uuid("landmark_id")
      .notNull()
      .references(() => landmarks.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 5 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    shortDescription: varchar("short_description", { length: 500 }).notNull().default(""),
    description: text("description").notNull().default(""),
    addressText: varchar("address_text", { length: 300 }),
    historicalNote: text("historical_note"),
    reviewStatus: varchar("review_status", { length: 20 }).notNull().default("draft"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("landmark_translations_landmark_id_locale_key").on(t.landmarkId, t.locale),
    check("landmark_translations_locale_check", inList("locale", LOCALES)),
    check("landmark_translations_review_status_check", inList("review_status", REVIEW_STATUSES)),
  ],
);

export const landmarkMedia = pgTable(
  "landmark_media",
  {
    id: pk(),
    landmarkId: uuid("landmark_id")
      .notNull()
      .references(() => landmarks.id, { onDelete: "cascade" }),
    mediaType: varchar("media_type", { length: 10 }).notNull(),
    storageKey: text("storage_key").notNull(),
    altText: jsonb("alt_text").$type<Record<string, string>>().notNull().default({}),
    copyrightCredit: text("copyright_credit").notNull(),
    license: text("license").notNull(),
    sourceUrl: text("source_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("landmark_media_type_check", inList("media_type", MEDIA_TYPES)),
    index("landmark_media_landmark_idx").on(t.landmarkId, t.sortOrder),
  ],
);

export const landmarkRevisions = pgTable(
  "landmark_revisions",
  {
    id: pk(),
    landmarkId: uuid("landmark_id")
      .notNull()
      .references(() => landmarks.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("landmark_revisions_landmark_idx").on(t.landmarkId, t.createdAt.desc().nullsFirst()),
  ],
);
