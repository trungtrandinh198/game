import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminAuditLogs, userModerationActions, users } from "@dnw/db";
import { errorResponseSchema } from "@dnw/schemas";
import { requirePermission } from "../../plugins/permission";
import { Errors } from "../../errors";

const okSchema = z.object({ ok: z.literal(true) });

const moderationActionSchema = z.object({
  action: z.enum(["kick", "suspend", "ban", "unban"]),
  reason: z.string().min(1).max(500),
  /** Chỉ dùng cho suspend: số giờ (1-720). */
  durationHours: z.number().int().min(1).max(720).optional(),
});

export const moderationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/admin/users/:id/moderation",
    {
      schema: {
        tags: ["admin", "moderation"],
        summary: "Hành động kiểm duyệt (kick, suspend, ban, unban)",
        params: z.object({ id: z.string().uuid() }),
        body: moderationActionSchema,
        response: { 200: okSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (req) => {
      await requirePermission(req, "moderation.act");
      const db = app.ctx.db;
      const actorId = req.auth!.userId;
      const { action, reason, durationHours } = req.body as z.infer<typeof moderationActionSchema>;
      const targetId = req.params.id;

      const [target] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, targetId));
      if (!target) throw Errors.notFound();

      // Xác định status mới
      let newStatus: string;
      let expiresAt: Date | null = null;
      switch (action) {
        case "kick":
          newStatus = target.status; // kick không đổi status
          break;
        case "suspend":
          newStatus = "suspended";
          expiresAt = new Date(Date.now() + (durationHours ?? 24) * 3600_000);
          break;
        case "ban":
          newStatus = "banned";
          break;
        case "unban":
          newStatus = "active";
          break;
      }

      // Cập nhật status (trừ kick)
      if (action !== "kick") {
        await db
          .update(users)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(users.id, targetId));
      }

      // Ghi user_moderation_actions
      await db.insert(userModerationActions).values({
        userId: targetId,
        moderatorId: actorId,
        actionType: action,
        reason,
        expiresAt,
      });

      // Ghi admin_audit_logs
      await db.insert(adminAuditLogs).values({
        actorUserId: actorId,
        action: `moderation.${action}`,
        targetType: "user",
        targetId,
        metadata: { reason, durationHours: durationHours ?? null, newStatus },
      });

      // Publish event to Redis channel `dnw:moderation` for realtime kick/ban
      if (app.ctx.redis) {
        const event = { type: action, userId: targetId, reason };
        await app.ctx.redis.publish("dnw:moderation", JSON.stringify(event));
      }

      return { ok: true as const };
    },
  );
};
