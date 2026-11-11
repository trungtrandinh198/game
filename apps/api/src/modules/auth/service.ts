import { normalizeDisplayName } from "@dnw/schemas";
import type { CurrentUser, Locale } from "@dnw/schemas";
import { hashPassword, verifyPassword } from "@dnw/db";
import type { AppContext } from "../../context";
import { AppError, Errors } from "../../errors";
import { renderEmail, type EmailKind } from "../../lib/email-templates";
import { loadAuthorities } from "../../lib/permissions";
import { checkSuspendExpiry } from "../../lib/suspend-expiry";
import { hashIp, randomToken, sha256Hex } from "../../lib/tokens";
import * as repo from "./repo";

const DAY_MS = 86_400_000;
const VERIFY_TTL_MS = DAY_MS;
const RESET_TTL_MS = 3_600_000;
/** Chỉ cập nhật last_seen_at khi đã quá 5 phút (mục 9.7). */
const TOUCH_INTERVAL_MS = 5 * 60_000;

let dummyHash: Promise<string> | undefined;
/** Băm giả để thời gian phản hồi không lộ email có tồn tại hay không. */
const timingHash = () => (dummyHash ??= hashPassword("timing-equalizer-password"));

const isUniqueViolation = (e: unknown, constraint?: string): boolean => {
  const err = e as {
    code?: string;
    cause?: { code?: string; constraint?: string };
    constraint?: string;
  };
  const code = err.cause?.code ?? err.code;
  const name = err.cause?.constraint ?? err.constraint;
  return code === "23505" && (constraint === undefined || name === constraint);
};

async function sendMail(
  ctx: AppContext,
  log: { error: (obj: object, msg: string) => void },
  input: { to: string; kind: EmailKind; locale: Locale; name: string; token?: string },
) {
  try {
    const content = renderEmail({
      kind: input.kind,
      locale: input.locale,
      name: input.name,
      baseUrl: ctx.config.APP_BASE_URL,
      ...(input.token ? { token: input.token } : {}),
    });
    await ctx.mailer.send({ to: input.to, ...content });
  } catch (e) {
    // Lỗi gửi thư không được làm lộ việc email có tồn tại; chỉ ghi log (không kèm nội dung thư).
    log.error(
      { err: e instanceof Error ? e.message : "send_failed", kind: input.kind },
      "mail_failed",
    );
  }
}

async function issueEmailToken(
  ctx: AppContext,
  userId: string,
  type: repo.EmailTokenType,
  ttlMs: number,
): Promise<string> {
  const token = randomToken();
  await repo.invalidateEmailTokens(ctx.db, userId, type);
  await repo.insertEmailToken(ctx.db, {
    userId,
    type,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  log: { error: (obj: object, msg: string) => void };
}

export async function register(
  ctx: AppContext,
  input: { email: string; password: string; displayName: string; locale: Locale },
  meta: RequestMeta,
): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const existing = await repo.findUserByEmail(ctx.db, input.email);
  if (existing) {
    await sendMail(ctx, meta.log, {
      to: existing.email,
      kind: "already_registered",
      locale: existing.locale,
      name: existing.displayName,
    });
    return;
  }

  const key = normalizeDisplayName(input.displayName);
  if (await repo.displayNameKeyExists(ctx.db, key)) {
    throw new AppError("CONFLICT_DISPLAY_NAME_TAKEN", 409, "Display name already taken");
  }

  const verifyRequired = ctx.config.REQUIRE_EMAIL_VERIFICATION;
  let userId: string;
  try {
    userId = await ctx.db.transaction(async (tx) =>
      repo.insertUser(tx as typeof ctx.db, {
        email: input.email,
        passwordHash,
        status: verifyRequired ? "pending" : "active",
        displayName: input.displayName,
        displayNameKey: key,
        locale: input.locale,
        termsAcceptedAt: new Date(),
      }),
    );
  } catch (e) {
    if (isUniqueViolation(e, "user_profiles_display_name_key_uq")) {
      throw new AppError("CONFLICT_DISPLAY_NAME_TAKEN", 409, "Display name already taken");
    }
    // Hai đăng ký cùng email chạy song song: người thua coi như email đã tồn tại.
    if (isUniqueViolation(e, "users_email_uq")) return;
    throw e;
  }

  const token = await issueEmailToken(ctx, userId, "verify_email", VERIFY_TTL_MS);
  await sendMail(ctx, meta.log, {
    to: input.email,
    kind: "verify",
    locale: input.locale,
    name: input.displayName,
    token,
  });
}

export async function login(
  ctx: AppContext,
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<{ token: string; maxAgeSeconds: number; user: CurrentUser }> {
  const user = await repo.findUserByEmail(ctx.db, input.email);
  const ok = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : (await verifyPassword(await timingHash(), input.password), false);
  if (!user || !ok) throw Errors.invalidCredentials();

  const effectiveStatus =
    user.status === "suspended" ? await checkSuspendExpiry(ctx.db, user.id) : user.status;
  if (effectiveStatus === "suspended" || effectiveStatus === "banned") throw Errors.suspended();
  if (ctx.config.REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt)
    throw Errors.emailNotVerified();

  const token = randomToken();
  const absoluteMs = ctx.config.SESSION_ABSOLUTE_DAYS * DAY_MS;
  await repo.insertSession(ctx.db, {
    userId: user.id,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + absoluteMs),
    ipHash: hashIp(meta.ip, ipSecret(ctx)),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  await repo.touchLogin(ctx.db, user.id);
  return {
    token,
    maxAgeSeconds: Math.floor(absoluteMs / 1000),
    user: await toCurrentUser(ctx, user),
  };
}

function ipSecret(ctx: AppContext): string {
  return ctx.config.IP_HASH_SECRET ?? ctx.config.REALTIME_TICKET_SECRET ?? "dnw-dev-ip-hash-secret";
}

export async function toCurrentUser(
  ctx: AppContext,
  user: Pick<repo.UserRecord, "id" | "displayName" | "locale" | "emailVerifiedAt">,
): Promise<CurrentUser> {
  const [authorities, character] = await Promise.all([
    loadAuthorities(ctx.db, user.id),
    repo.hasCharacter(ctx.db, user.id),
  ]);
  return {
    id: user.id,
    displayName: user.displayName,
    locale: user.locale,
    roles: authorities.roles,
    permissions: authorities.permissions,
    hasCharacter: character,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export async function me(ctx: AppContext, userId: string): Promise<CurrentUser> {
  const user = await repo.findUserById(ctx.db, userId);
  if (!user) throw Errors.unauthenticated();
  return toCurrentUser(ctx, user);
}

/** Đọc cookie thành session hợp lệ, hoặc null. Cập nhật last_seen_at tối đa 5 phút một lần. */
export async function resolveSession(ctx: AppContext, token: string) {
  const s = await repo.findActiveSession(ctx.db, sha256Hex(token), ctx.config.SESSION_IDLE_DAYS);
  if (!s || s.status === "suspended" || s.status === "banned") return null;
  if (Date.now() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS)
    await repo.touchSession(ctx.db, s.sessionId);
  return s;
}

export async function logout(ctx: AppContext, sessionId: string): Promise<void> {
  await repo.revokeSession(ctx.db, sessionId);
}

export async function verifyEmail(ctx: AppContext, token: string): Promise<void> {
  const userId = await repo.consumeEmailToken(ctx.db, sha256Hex(token), "verify_email");
  if (!userId) throw Errors.tokenInvalid();
  await repo.markEmailVerified(ctx.db, userId);
}

export async function resendVerification(
  ctx: AppContext,
  email: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await repo.findUserByEmail(ctx.db, email);
  if (!user || user.emailVerifiedAt || user.status === "banned") return;
  const token = await issueEmailToken(ctx, user.id, "verify_email", VERIFY_TTL_MS);
  await sendMail(ctx, meta.log, {
    to: user.email,
    kind: "verify",
    locale: user.locale,
    name: user.displayName,
    token,
  });
}

export async function forgotPassword(
  ctx: AppContext,
  email: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await repo.findUserByEmail(ctx.db, email);
  if (!user || user.status === "banned") return;
  const token = await issueEmailToken(ctx, user.id, "reset_password", RESET_TTL_MS);
  await sendMail(ctx, meta.log, {
    to: user.email,
    kind: "reset",
    locale: user.locale,
    name: user.displayName,
    token,
  });
}

export async function resetPassword(
  ctx: AppContext,
  token: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  const userId = await repo.consumeEmailToken(ctx.db, sha256Hex(token), "reset_password");
  if (!userId) throw Errors.tokenInvalid();
  await repo.setPassword(ctx.db, userId, passwordHash);
  // Người nhận được thư reset kiểm soát được hộp thư nên coi như đã xác minh email.
  await repo.markEmailVerified(ctx.db, userId);
  await repo.revokeUserSessions(ctx.db, userId);
}

export async function changePassword(
  ctx: AppContext,
  auth: { userId: string; sessionId: string },
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await repo.findUserById(ctx.db, auth.userId);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw Errors.invalidCredentials();
  }
  await repo.setPassword(ctx.db, user.id, await hashPassword(input.newPassword));
  await repo.revokeUserSessions(ctx.db, user.id, auth.sessionId);
}
