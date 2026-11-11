import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { userReports, users } from "@dnw/db";
import { errorResponseSchema } from "@dnw/schemas";
import { requireAuth } from "../../plugins/auth";
import { AppError, Errors } from "../../errors";
import { enforceRateLimits, LIMITS } from "../../lib/rate-limit";

const REPORT_REASONS = ["harassment", "cheating", "inappropriate_name", "spam", "other"] as const;

const createReportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reasonCode: z.enum(REPORT_REASONS),
  description: z.string().max(1000).optional(),
});

const okSchema = z.object({ ok: z.literal(true) });

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/reports",
    {
      schema: {
        tags: ["reports"],
        summary: "Báo cáo người chơi khác",
        body: createReportSchema,
        response: { 201: okSchema, 400: errorResponseSchema, 401: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (req, reply) => {
      const auth = requireAuth(req);
      const { reportedUserId, reasonCode, description } = req.body as z.infer<typeof createReportSchema>;

      // Không tự báo cáo mình
      if (reportedUserId === auth.userId) {
        throw new AppError("VALIDATION_ERROR", 400, "CANNOT_REPORT_SELF");
      }

      // Kiểm tra người bị báo cáo tồn tại
      const [target] = await app.ctx.db.select({ id: users.id }).from(users).where(eq(users.id, reportedUserId));
      if (!target) throw Errors.notFound();

      // Rate limit: 10/giờ/người
      await enforceRateLimits(app.ctx, [
        { name: "reports", key: auth.userId, ...LIMITS.reportsPerUser },
      ]);

      await app.ctx.db.insert(userReports).values({
        reporterUserId: auth.userId,
        reportedUserId,
        reasonCode,
        description: description ?? null,
      });

      reply.code(201);
      return { ok: true as const };
    },
  );
};
