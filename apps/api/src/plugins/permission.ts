import type { FastifyRequest } from "fastify";
import { loadAuthorities } from "../lib/permissions";
import { Errors } from "../errors";
import type { AppContext } from "../context";

/**
 * Yêu cầu đã đăng nhập + có quyền `code`.
 * Trả về authorities đã load (để handler dùng tiếp mà không query lại).
 */
export async function requirePermission(req: FastifyRequest, code: string) {
  if (!req.auth) throw Errors.unauthenticated();
  const ctx = req.server.ctx as AppContext;
  const authorities = await loadAuthorities(ctx.db, req.auth.userId);
  if (!authorities.permissions.includes(code)) throw Errors.forbidden();
  return authorities;
}
