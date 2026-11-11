import {
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  ticketClaimsSchema,
  type TicketClaims,
} from "@dnw/schemas";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

export const TICKET_TTL_SECONDS = 60;

const key = (secret: string) => new TextEncoder().encode(secret);

export interface SignTicketInput {
  userId: string;
  zoneCode: string;
  protocolVersion: number;
  displayName?: string;
  avatarCode?: string;
  /** Chỉ dùng cho test: ghi đè thời gian hết hạn. */
  expiresIn?: string | number;
}

/** Ký ticket (API thật ký ở T11; hàm này phục vụ dev/test). */
export async function signTicket(secret: string, input: SignTicketInput): Promise<string> {
  const jwt = new SignJWT({
    zone: input.zoneCode,
    pv: input.protocolVersion,
    ...(input.displayName ? { dn: input.displayName } : {}),
    ...(input.avatarCode ? { av: input.avatarCode } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? `${TICKET_TTL_SECONDS}s`);
  return jwt.sign(key(secret));
}

export class TicketError extends Error {
  constructor(
    readonly code: "INVALID_TICKET" | "PROTOCOL_MISMATCH" | "ZONE_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

/** Kiểm tra chữ ký, iss, aud, exp và các claim; không kiểm tra jti đã dùng (xem UsedTickets). */
export async function verifyTicket(
  secret: string,
  token: string,
  expected: { protocolVersion: number; zoneCode: string },
): Promise<TicketClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(secret), {
      issuer: TICKET_ISSUER,
      audience: TICKET_AUDIENCE,
      algorithms: ["HS256"],
    }));
  } catch {
    throw new TicketError("INVALID_TICKET", "ticket không hợp lệ hoặc đã hết hạn");
  }
  const parsed = ticketClaimsSchema.safeParse({
    sub: payload.sub,
    jti: payload.jti,
    zone: payload["zone"],
    pv: payload["pv"],
    dn: payload["dn"],
    av: payload["av"],
  });
  if (!parsed.success) throw new TicketError("INVALID_TICKET", "claim của ticket sai");
  if (parsed.data.pv !== expected.protocolVersion) {
    throw new TicketError("PROTOCOL_MISMATCH", "sai phiên bản giao thức");
  }
  if (parsed.data.zone !== expected.zoneCode) {
    throw new TicketError("ZONE_MISMATCH", "ticket không dành cho zone này");
  }
  return parsed.data;
}

/** Ghi nhớ jti đã dùng để ticket chỉ dùng được một lần (T11 chuyển sang Redis). */
export class UsedTickets {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = TICKET_TTL_SECONDS * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Trả true nếu jti chưa từng dùng (và đánh dấu đã dùng). */
  consume(jti: string): boolean {
    const t = this.now();
    for (const [id, expires] of this.seen) {
      if (expires <= t) this.seen.delete(id);
    }
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, t + this.ttlMs);
    return true;
  }
}
