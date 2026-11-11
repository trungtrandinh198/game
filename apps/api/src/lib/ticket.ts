import { TICKET_AUDIENCE, TICKET_ISSUER } from "@dnw/schemas";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

export const TICKET_TTL_SECONDS = 60;

/** Khóa dev dùng chung với realtime khi chưa cấu hình; production bắt buộc có REALTIME_TICKET_SECRET (config.ts). */
export const DEV_TICKET_SECRET = "dev-only-realtime-ticket-secret-change-me-0123456789";

/** Ký join ticket HS256 sống 60 giây (mục 8.8); `jti` dùng một lần ở realtime. */
export async function signJoinTicket(
  secret: string,
  input: { userId: string; zoneCode: string; protocolVersion: number },
): Promise<string> {
  return new SignJWT({ zone: input.zoneCode, pv: input.protocolVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}
