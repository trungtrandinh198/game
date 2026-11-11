import {
  authSessions,
  emailTokens,
  playerCharacters,
  roles,
  userProfiles,
  userRoles,
  users,
} from "@dnw/db";
import type { Database } from "@dnw/db";
import type { Locale } from "@dnw/schemas";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

export type EmailTokenType = "verify_email" | "reset_password";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  displayName: string;
  locale: Locale;
}

const userColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
  displayName: userProfiles.displayName,
  locale: userProfiles.locale,
};

export async function findUserByEmail(
  db: Database,
  email: string,
): Promise<UserRecord | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(sql`lower(${users.email})`, email), isNull(users.deletedAt)))
    .limit(1);
  return row as UserRecord | undefined;
}

export async function findUserById(db: Database, id: string): Promise<UserRecord | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return row as UserRecord | undefined;
}

export async function displayNameKeyExists(db: Database, key: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.displayNameKey, key))
    .limit(1);
  return row !== undefined;
}

export async function insertUser(
  db: Database,
  input: {
    email: string;
    passwordHash: string;
    status: "pending" | "active";
    displayName: string;
    displayNameKey: string;
    locale: Locale;
    termsAcceptedAt: Date;
  },
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: input.passwordHash,
      status: input.status,
      termsAcceptedAt: input.termsAcceptedAt,
    })
    .returning({ id: users.id });
  const userId = user!.id;
  await db.insert(userProfiles).values({
    userId,
    displayName: input.displayName,
    displayNameKey: input.displayNameKey,
    locale: input.locale,
  });
  const [player] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "player"));
  if (player) await db.insert(userRoles).values({ userId, roleId: player.id });
  return userId;
}

export async function hasCharacter(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: playerCharacters.id })
    .from(playerCharacters)
    .where(eq(playerCharacters.userId, userId))
    .limit(1);
  return row !== undefined;
}

export async function touchLogin(db: Database, userId: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function setPassword(
  db: Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** Đánh dấu email đã xác minh và kích hoạt tài khoản đang chờ. */
export async function markEmailVerified(db: Database, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId));
  await db
    .update(users)
    .set({ status: "active" })
    .where(and(eq(users.id, userId), eq(users.status, "pending")));
}

export async function insertEmailToken(
  db: Database,
  input: { userId: string; type: EmailTokenType; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(emailTokens).values(input);
}

/** Dùng token một lần: chỉ trả user nếu token còn hạn và chưa dùng, đồng thời đánh dấu đã dùng. */
export async function consumeEmailToken(
  db: Database,
  tokenHash: string,
  type: EmailTokenType,
): Promise<string | undefined> {
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.type, type),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId;
}

export async function invalidateEmailTokens(
  db: Database,
  userId: string,
  type: EmailTokenType,
): Promise<void> {
  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(emailTokens.userId, userId), eq(emailTokens.type, type), isNull(emailTokens.usedAt)),
    );
}

export async function insertSession(
  db: Database,
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipHash: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const [row] = await db.insert(authSessions).values(input).returning({ id: authSessions.id });
  return row!.id;
}

export interface SessionRecord {
  sessionId: string;
  lastSeenAt: Date;
  userId: string;
  status: string;
  emailVerifiedAt: Date | null;
  displayName: string;
  locale: Locale;
}

/** Session còn hiệu lực theo hạn tuyệt đối và hạn trượt; cắt khỏi user đã xóa mềm. */
export async function findActiveSession(
  db: Database,
  tokenHash: string,
  idleDays: number,
): Promise<SessionRecord | undefined> {
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      lastSeenAt: authSessions.lastSeenAt,
      userId: users.id,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      displayName: userProfiles.displayName,
      locale: userProfiles.locale,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
        gt(authSessions.lastSeenAt, sql`now() - make_interval(days => ${idleDays})`),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return row as SessionRecord | undefined;
}

export async function touchSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessions.id, sessionId));
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}

export async function revokeUserSessions(
  db: Database,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
        exceptSessionId ? ne(authSessions.id, exceptSessionId) : undefined,
      ),
    );
}
