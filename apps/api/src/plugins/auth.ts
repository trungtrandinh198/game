import type { FastifyRequest } from "fastify";
import type { AuthContext } from "../context";
import { Errors } from "../errors";

/** Yêu cầu đã đăng nhập; dùng trong handler của route cần xác thực. */
export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw Errors.unauthenticated();
  return req.auth;
}
