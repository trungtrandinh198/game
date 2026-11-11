import { EMAIL_TOKEN_TYPES, LOCALES, USER_STATUSES } from "@dnw/schemas";
import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, inList, pk, tz, updatedAt } from "./common";

export const users = pgTable(
  "users",
  {
    id: pk(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    emailVerifiedAt: tz("email_verified_at"),
    termsAcceptedAt: tz("terms_accepted_at"),
    lastLoginAt: tz("last_login_at"),
    deletedAt: tz("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_status_check", inList("status", USER_STATUSES)),
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    index("users_email_trgm_idx").using("gin", t.email.op("gin_trgm_ops")),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    displayNameKey: varchar("display_name_key", { length: 32 }).notNull(),
    locale: varchar("locale", { length: 5 }).notNull().default("vi"),
    countryCode: char("country_code", { length: 2 }),
    bio: varchar("bio", { length: 160 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_profiles_locale_check", inList("locale", LOCALES)),
    uniqueIndex("user_profiles_display_name_key_uq").on(t.displayNameKey),
    index("user_profiles_display_name_trgm_idx").using("gin", t.displayName.op("gin_trgm_ops")),
  ],
);

export const roles = pgTable("roles", {
  id: pk(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
});

export const permissions = pgTable("permissions", {
  id: pk(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  description: text("description"),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    revokedAt: tz("revoked_at"),
    ipHash: char("ip_hash", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("auth_sessions_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    usedAt: tz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("email_tokens_type_check", inList("type", EMAIL_TOKEN_TYPES)),
    index("email_tokens_user_type_idx").on(t.userId, t.type),
  ],
);
