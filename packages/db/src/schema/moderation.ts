import { MODERATION_ACTIONS, REPORT_STATUSES } from "@dnw/schemas";
import { char, check, index, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./account";
import { createdAt, inList, pk, tz } from "./common";

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: pk(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: char("ip_hash", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_logs_actor_idx").on(t.actorUserId, t.createdAt.desc().nullsFirst()),
    index("admin_audit_logs_created_idx").on(t.createdAt.desc().nullsFirst()),
  ],
);

export const userReports = pgTable(
  "user_reports",
  {
    id: pk(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: uuid("reported_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reasonCode: varchar("reason_code", { length: 50 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: tz("resolved_at"),
  },
  (t) => [
    check("user_reports_status_check", inList("status", REPORT_STATUSES)),
    index("user_reports_status_idx").on(t.status, t.createdAt.desc().nullsFirst()),
  ],
);

export const userModerationActions = pgTable(
  "user_moderation_actions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    moderatorId: uuid("moderator_id").references(() => users.id, { onDelete: "set null" }),
    actionType: varchar("action_type", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    expiresAt: tz("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("user_moderation_actions_action_check", inList("action_type", MODERATION_ACTIONS)),
    index("user_moderation_actions_user_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
  ],
);
