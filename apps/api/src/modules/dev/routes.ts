import type { FastifyPluginAsync } from "fastify";
import type { MemoryMailer } from "../../lib/mailer";

/** Chỉ dev/test: xem thư đã "gửi" bằng bộ nhớ khi chưa có SMTP (thay cho Mailpit). Không bao giờ đăng ký ở production. */
export const devMailboxRoutes: FastifyPluginAsync<{ mailer: MemoryMailer }> = async (
  app,
  { mailer },
) => {
  app.get("/dev/mailbox", { schema: { hide: true } }, async (req) => {
    const to = (req.query as { to?: string }).to?.toLowerCase();
    return { items: mailer.outbox.filter((m) => !to || m.to.toLowerCase() === to) };
  });
};
