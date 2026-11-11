import { adminAuditLogs, userModerationActions, users } from "@dnw/db";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@dnw/db";

/**
 * Kiểm tra suspend hết hạn: nếu user đang `suspended` và action suspend gần nhất
 * có `expires_at` trong quá khứ thì tự đưa về `active` kèm ghi vết.
 * Trả về status mới sau khi kiểm tra.
 */
export async function checkSuspendExpiry(db: Database, userId: string): Promise<string> {
  const [user] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId));
  if (!user || user.status !== "suspended") return user?.status ?? "active";

  const [action] = await db
    .select({ expiresAt: userModerationActions.expiresAt })
    .from(userModerationActions)
    .where(eq(userModerationActions.userId, userId))
    .orderBy(desc(userModerationActions.createdAt))
    .limit(1);

  if (action?.expiresAt && action.expiresAt.getTime() <= Date.now()) {
    await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, userId));
    await db.insert(adminAuditLogs).values({
      actorUserId: null,
      action: "moderation.suspend_expired",
      targetType: "user",
      targetId: userId,
      metadata: { previousStatus: "suspended", newStatus: "active" },
    });
    return "active";
  }

  return "suspended";
}
