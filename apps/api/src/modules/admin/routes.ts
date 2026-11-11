import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  adminAuditLogs,
  avatars,
  gameRooms,
  landmarks,
  userProfiles,
  userReports,
  users,
  vehicleTypes,
  worldZones,
} from "@dnw/db";
import { requirePermission } from "../../plugins/permission";
import { Errors } from "../../errors";
import { errorResponseSchema } from "@dnw/schemas";

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

// ---------- Schemas ----------

const dashboardSchema = z.object({
  totalUsers: z.number(),
  onlineUsers: z.number(),
  newUsersToday: z.number(),
  newUsersThisWeek: z.number(),
  activeRooms: z.number(),
  publishedLandmarks: z.number(),
  openReports: z.number(),
});

const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  status: z.string(),
  locale: z.string(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});

const adminUserListSchema = z.object({ items: z.array(adminUserSchema), total: z.number() });

const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  actorDisplayName: z.string().nullable(),
  createdAt: z.string(),
});

const auditLogListSchema = z.object({ items: z.array(auditLogSchema) });

const reportSchema = z.object({
  id: z.string(),
  reporterName: z.string(),
  reportedName: z.string(),
  reasonCode: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

const reportListSchema = z.object({ items: z.array(reportSchema) });

const roomSchema = z.object({
  id: z.string(),
  roomCode: z.string(),
  zoneCode: z.string(),
  capacity: z.number(),
  status: z.string(),
  serverInstance: z.string(),
  peakPlayers: z.number(),
  createdAt: z.string(),
});

const roomListSchema = z.object({ items: z.array(roomSchema) });

const adminAvatarSchema = z.object({
  id: z.string(),
  code: z.string(),
  gender: z.string(),
  sortOrder: z.number(),
  active: z.boolean(),
});

const adminAvatarListSchema = z.object({ items: z.array(adminAvatarSchema) });

const adminVehicleSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.string(),
  active: z.boolean(),
});

const adminVehicleListSchema = z.object({ items: z.array(adminVehicleSchema) });

const okSchema = z.object({ ok: z.literal(true) });

// ---------- Routes ----------

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // Dashboard
  app.get(
    "/admin/dashboard",
    {
      schema: {
        tags: ["admin"],
        summary: "Dashboard tổng quan",
        response: { 200: dashboardSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "dashboard.read");
      const db = app.ctx.db;
      const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const [newToday] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(gte(users.createdAt, new Date(Date.now() - 86_400_000)));
      const [newWeek] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(gte(users.createdAt, new Date(Date.now() - 7 * 86_400_000)));
      const [roomCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(gameRooms)
        .where(eq(gameRooms.status, "active"));
      const [landmarkCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(landmarks)
        .where(and(eq(landmarks.status, "published"), isNull(landmarks.deletedAt)));
      const [reportCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userReports)
        .where(eq(userReports.status, "open"));

      return {
        totalUsers: userCount?.count ?? 0,
        onlineUsers: 0,
        newUsersToday: newToday?.count ?? 0,
        newUsersThisWeek: newWeek?.count ?? 0,
        activeRooms: roomCount?.count ?? 0,
        publishedLandmarks: landmarkCount?.count ?? 0,
        openReports: reportCount?.count ?? 0,
      };
    },
  );

  // Users list
  app.get(
    "/admin/users",
    {
      schema: {
        tags: ["admin"],
        summary: "Danh sách người dùng (tìm kiếm)",
        querystring: z.object({
          q: z.string().max(100).optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: { 200: adminUserListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "users.read");
      const db = app.ctx.db;
      const { q, page, limit } = req.query as { q?: string; page: number; limit: number };
      const offset = (page - 1) * limit;

      const where = q
        ? sql`(${users.email} ILIKE ${`%${q}%`} OR ${userProfiles.displayName} ILIKE ${`%${q}%`} OR ${users.id}::text = ${q})`
        : undefined;

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: userProfiles.displayName,
          status: users.status,
          locale: userProfiles.locale,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(where);

      return {
        items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastLoginAt: iso(r.lastLoginAt) })),
        total: countRow?.count ?? 0,
      };
    },
  );

  // User detail
  app.get(
    "/admin/users/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Chi tiết người dùng",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: adminUserSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "users.read");
      const db = app.ctx.db;
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: userProfiles.displayName,
          status: users.status,
          locale: userProfiles.locale,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, req.params.id));
      if (!row) throw Errors.notFound();
      return { ...row, createdAt: row.createdAt.toISOString(), lastLoginAt: iso(row.lastLoginAt) };
    },
  );

  // Patch user status
  app.patch(
    "/admin/users/:id/status",
    {
      schema: {
        tags: ["admin"],
        summary: "Đổi trạng thái người dùng",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ status: z.enum(["active", "suspended", "banned"]) }),
        response: { 200: okSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "users.status.update");
      const db = app.ctx.db;
      const actorId = req.auth!.userId;
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, req.params.id));
      if (!user) throw Errors.notFound();

      await db.update(users).set({ status: req.body.status, updatedAt: new Date() }).where(eq(users.id, req.params.id));
      await db.insert(adminAuditLogs).values({
        actorUserId: actorId,
        action: "user.status_change",
        targetType: "user",
        targetId: req.params.id,
        metadata: { status: req.body.status },
      });
      return { ok: true as const };
    },
  );

  // Audit logs
  app.get(
    "/admin/audit-logs",
    {
      schema: {
        tags: ["admin"],
        summary: "Nhật ký admin",
        querystring: z.object({
          actorId: z.string().uuid().optional(),
          action: z.string().max(100).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: auditLogListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "audit.read");
      const db = app.ctx.db;
      const { actorId, action, from, to, page, limit } = req.query as {
        actorId?: string;
        action?: string;
        from?: string;
        to?: string;
        page: number;
        limit: number;
      };
      const offset = (page - 1) * limit;

      const conditions = [];
      if (actorId) conditions.push(eq(adminAuditLogs.actorUserId, actorId));
      if (action) conditions.push(eq(adminAuditLogs.action, action));
      if (from) conditions.push(gte(adminAuditLogs.createdAt, new Date(from)));
      if (to) conditions.push(sql`${adminAuditLogs.createdAt} <= ${new Date(to)}`);

      const rows = await db
        .select({
          id: adminAuditLogs.id,
          action: adminAuditLogs.action,
          targetType: adminAuditLogs.targetType,
          targetId: adminAuditLogs.targetId,
          metadata: adminAuditLogs.metadata,
          actorDisplayName: userProfiles.displayName,
          createdAt: adminAuditLogs.createdAt,
        })
        .from(adminAuditLogs)
        .leftJoin(users, eq(users.id, adminAuditLogs.actorUserId))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return { items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
    },
  );

  // Reports
  app.get(
    "/admin/reports",
    {
      schema: {
        tags: ["admin"],
        summary: "Danh sách báo cáo",
        querystring: z.object({
          status: z.enum(["open", "reviewing", "resolved", "rejected"]).optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: { 200: reportListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "reports.read");
      const db = app.ctx.db;
      const { status, page, limit } = req.query as { status?: string; page: number; limit: number };
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          id: userReports.id,
          reporterName: sql<string>`(SELECT ${userProfiles.displayName} FROM ${userProfiles} WHERE ${userProfiles.userId} = ${userReports.reporterUserId})`,
          reportedName: sql<string>`(SELECT ${userProfiles.displayName} FROM ${userProfiles} WHERE ${userProfiles.userId} = ${userReports.reportedUserId})`,
          reasonCode: userReports.reasonCode,
          description: userReports.description,
          status: userReports.status,
          createdAt: userReports.createdAt,
          resolvedAt: userReports.resolvedAt,
        })
        .from(userReports)
        .where(status ? eq(userReports.status, status) : undefined)
        .orderBy(desc(userReports.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), resolvedAt: iso(r.resolvedAt) })),
      };
    },
  );

  // Resolve report
  app.post(
    "/admin/reports/:id/resolve",
    {
      schema: {
        tags: ["admin"],
        summary: "Xử lý báo cáo",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ status: z.enum(["resolved", "rejected"]), note: z.string().max(500).optional() }),
        response: { 200: okSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "reports.resolve");
      const db = app.ctx.db;
      const actorId = req.auth!.userId;
      const [report] = await db.select({ id: userReports.id }).from(userReports).where(eq(userReports.id, req.params.id));
      if (!report) throw Errors.notFound();

      await db
        .update(userReports)
        .set({ status: req.body.status, handledBy: actorId, resolvedAt: new Date() })
        .where(eq(userReports.id, req.params.id));
      await db.insert(adminAuditLogs).values({
        actorUserId: actorId,
        action: "report.resolve",
        targetType: "report",
        targetId: req.params.id,
        metadata: { status: req.body.status, note: req.body.note ?? null },
      });
      return { ok: true as const };
    },
  );

  // Rooms
  app.get(
    "/admin/rooms",
    {
      schema: {
        tags: ["admin"],
        summary: "Danh sách room",
        response: { 200: roomListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "rooms.read");
      const db = app.ctx.db;
      const rows = await db
        .select({
          id: gameRooms.id,
          roomCode: gameRooms.roomCode,
          zoneCode: worldZones.code,
          capacity: gameRooms.capacity,
          status: gameRooms.status,
          serverInstance: gameRooms.serverInstance,
          peakPlayers: gameRooms.peakPlayers,
          createdAt: gameRooms.createdAt,
        })
        .from(gameRooms)
        .innerJoin(worldZones, eq(worldZones.id, gameRooms.zoneId))
        .orderBy(desc(gameRooms.createdAt));
      return { items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
    },
  );

  // Avatars
  app.get(
    "/admin/avatars",
    {
      schema: {
        tags: ["admin"],
        summary: "Danh sách avatar",
        response: { 200: adminAvatarListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "avatars.manage");
      const db = app.ctx.db;
      const rows = await db
        .select({
          id: avatars.id,
          code: avatars.code,
          gender: avatars.gender,
          sortOrder: avatars.sortOrder,
          active: avatars.isActive,
        })
        .from(avatars)
        .orderBy(avatars.sortOrder);
      return { items: rows };
    },
  );

  // Vehicles
  app.get(
    "/admin/vehicles",
    {
      schema: {
        tags: ["admin"],
        summary: "Danh sách loại xe",
        response: { 200: adminVehicleListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "vehicles.manage");
      const db = app.ctx.db;
      const rows = await db
        .select({
          id: vehicleTypes.id,
          code: vehicleTypes.code,
          kind: vehicleTypes.kind,
          active: vehicleTypes.isActive,
        })
        .from(vehicleTypes)
        .orderBy(vehicleTypes.code);
      return { items: rows };
    },
  );
};
