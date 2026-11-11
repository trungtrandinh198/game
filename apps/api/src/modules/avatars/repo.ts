import { avatars } from "@dnw/db";
import type { Database } from "@dnw/db";
import { asc, eq } from "drizzle-orm";

export function listActiveAvatars(db: Database) {
  return db
    .select({
      id: avatars.id,
      code: avatars.code,
      gender: avatars.gender,
      rig: avatars.rig,
      animationSet: avatars.animationSet,
      modelKey: avatars.modelKey,
      thumbnailKey: avatars.thumbnailKey,
      contentVersion: avatars.contentVersion,
    })
    .from(avatars)
    .where(eq(avatars.isActive, true))
    .orderBy(asc(avatars.sortOrder), asc(avatars.code));
}
