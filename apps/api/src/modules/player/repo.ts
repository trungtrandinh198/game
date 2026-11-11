import {
  avatars,
  playerCharacters,
  playerDiscoveries,
  playerProgress,
  userProfiles,
  users,
} from "@dnw/db";
import type { Database } from "@dnw/db";
import type { Locale } from "@dnw/schemas";
import { and, asc, eq, ne } from "drizzle-orm";

export async function getProfile(db: Database, userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      displayName: userProfiles.displayName,
      locale: userProfiles.locale,
      countryCode: userProfiles.countryCode,
      bio: userProfiles.bio,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId));
  return row as
    | {
        id: string;
        email: string;
        emailVerifiedAt: Date | null;
        displayName: string;
        locale: Locale;
        countryCode: string | null;
        bio: string | null;
      }
    | undefined;
}

export async function displayNameTakenByOther(
  db: Database,
  key: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(and(eq(userProfiles.displayNameKey, key), ne(userProfiles.userId, userId)))
    .limit(1);
  return row !== undefined;
}

export async function updateProfile(
  db: Database,
  userId: string,
  patch: Partial<{
    displayName: string;
    displayNameKey: string;
    locale: Locale;
    countryCode: string | null;
    bio: string | null;
  }>,
): Promise<void> {
  await db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));
}

export async function listCharacters(db: Database, userId: string) {
  return db
    .select()
    .from(playerCharacters)
    .where(eq(playerCharacters.userId, userId))
    .orderBy(asc(playerCharacters.createdAt));
}

export async function getCharacter(db: Database, id: string, userId: string) {
  const [row] = await db
    .select()
    .from(playerCharacters)
    .where(and(eq(playerCharacters.id, id), eq(playerCharacters.userId, userId)));
  return row;
}

export async function activeAvatar(db: Database, avatarId: string) {
  const [row] = await db
    .select({ id: avatars.id })
    .from(avatars)
    .where(and(eq(avatars.id, avatarId), eq(avatars.isActive, true)));
  return row;
}

export async function insertCharacter(
  db: Database,
  input: {
    userId: string;
    avatarId: string;
    characterName: string | null;
    appearanceConfig: Record<string, unknown>;
  },
) {
  const [row] = await db.insert(playerCharacters).values(input).returning();
  return row!;
}

export async function updateCharacter(
  db: Database,
  id: string,
  patch: Partial<{
    avatarId: string;
    characterName: string | null;
    appearanceConfig: Record<string, unknown>;
  }>,
) {
  const [row] = await db
    .update(playerCharacters)
    .set(patch)
    .where(eq(playerCharacters.id, id))
    .returning();
  return row!;
}

export async function getProgress(db: Database, userId: string) {
  const [progress] = await db
    .select()
    .from(playerProgress)
    .where(eq(playerProgress.userId, userId));
  const discoveries = await db
    .select({
      landmarkId: playerDiscoveries.landmarkId,
      discoveredAt: playerDiscoveries.discoveredAt,
    })
    .from(playerDiscoveries)
    .where(eq(playerDiscoveries.userId, userId))
    .orderBy(asc(playerDiscoveries.discoveredAt));
  return { progress, discoveries };
}
