import { normalizeDisplayName } from "@dnw/schemas";
import type { AppearanceConfig, CharacterDto, Locale, Profile } from "@dnw/schemas";
import type { AppContext } from "../../context";
import { AppError, Errors } from "../../errors";
import { assertDisplayNameAllowed } from "../../lib/name-policy";
import * as repo from "./repo";

const invalid = (path: string, issue: string) =>
  new AppError("VALIDATION_ERROR", 400, "Invalid input", [{ path, issue }]);

const isUnique = (e: unknown, constraint: string) => {
  const err = e as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  return (
    (err.cause?.code ?? err.code) === "23505" &&
    (err.cause?.constraint ?? err.constraint) === constraint
  );
};

export async function getProfile(ctx: AppContext, userId: string): Promise<Profile> {
  const p = await repo.getProfile(ctx.db, userId);
  if (!p) throw Errors.notFound();
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    locale: p.locale,
    countryCode: p.countryCode,
    bio: p.bio,
    emailVerified: p.emailVerifiedAt !== null,
  };
}

export async function updateProfile(
  ctx: AppContext,
  userId: string,
  input: {
    displayName?: string;
    locale?: Locale;
    countryCode?: string | null;
    bio?: string | null;
  },
): Promise<Profile> {
  const patch: Parameters<typeof repo.updateProfile>[2] = {};
  if (input.displayName !== undefined) {
    const key = normalizeDisplayName(input.displayName);
    assertDisplayNameAllowed(key);
    if (await repo.displayNameTakenByOther(ctx.db, key, userId)) {
      throw new AppError("CONFLICT_DISPLAY_NAME_TAKEN", 409, "Display name already taken");
    }
    patch.displayName = input.displayName;
    patch.displayNameKey = key;
  }
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.countryCode !== undefined) patch.countryCode = input.countryCode;
  if (input.bio !== undefined)
    patch.bio = input.bio === null || input.bio === "" ? null : input.bio;

  try {
    await repo.updateProfile(ctx.db, userId, patch);
  } catch (e) {
    if (isUnique(e, "user_profiles_display_name_key_uq")) {
      throw new AppError("CONFLICT_DISPLAY_NAME_TAKEN", 409, "Display name already taken");
    }
    throw e;
  }
  return getProfile(ctx, userId);
}

type CharacterRow = Awaited<ReturnType<typeof repo.getCharacter>> & object;

function toCharacterDto(row: CharacterRow): CharacterDto {
  return {
    id: row.id,
    avatarId: row.avatarId,
    characterName: row.characterName,
    appearanceConfig: row.appearanceConfig as AppearanceConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCharacters(ctx: AppContext, userId: string): Promise<CharacterDto[]> {
  return (await repo.listCharacters(ctx.db, userId)).map(toCharacterDto);
}

export async function createCharacter(
  ctx: AppContext,
  userId: string,
  input: {
    avatarId: string;
    characterName?: string | undefined;
    appearanceConfig: AppearanceConfig;
  },
): Promise<CharacterDto> {
  if ((await repo.listCharacters(ctx.db, userId)).length > 0) {
    throw new AppError("CHARACTER_ALREADY_EXISTS", 409, "Character already exists");
  }
  if (!(await repo.activeAvatar(ctx.db, input.avatarId)))
    throw invalid("avatarId", "avatar_unavailable");
  try {
    const row = await repo.insertCharacter(ctx.db, {
      userId,
      avatarId: input.avatarId,
      characterName: input.characterName ?? null,
      appearanceConfig: input.appearanceConfig,
    });
    return toCharacterDto(row);
  } catch (e) {
    // Hai yêu cầu song song: ràng buộc UNIQUE(user_id) bảo đảm chỉ một nhân vật.
    if (isUnique(e, "player_characters_user_id_unique")) {
      throw new AppError("CHARACTER_ALREADY_EXISTS", 409, "Character already exists");
    }
    throw e;
  }
}

export async function updateCharacter(
  ctx: AppContext,
  userId: string,
  id: string,
  input: { avatarId?: string; characterName?: string | null; appearanceConfig?: AppearanceConfig },
): Promise<CharacterDto> {
  // Nhân vật của người khác trả 404 như không tồn tại, không lộ sự có mặt của ID.
  if (!(await repo.getCharacter(ctx.db, id, userId))) throw Errors.notFound();
  if (input.avatarId !== undefined && !(await repo.activeAvatar(ctx.db, input.avatarId))) {
    throw invalid("avatarId", "avatar_unavailable");
  }
  const patch: Parameters<typeof repo.updateCharacter>[2] = {};
  if (input.avatarId !== undefined) patch.avatarId = input.avatarId;
  if (input.characterName !== undefined) patch.characterName = input.characterName;
  if (input.appearanceConfig !== undefined) patch.appearanceConfig = input.appearanceConfig;
  return toCharacterDto(await repo.updateCharacter(ctx.db, id, patch));
}

export async function getProgress(ctx: AppContext, userId: string) {
  const { progress, discoveries } = await repo.getProgress(ctx.db, userId);
  return {
    lastZoneId: progress?.lastZoneId ?? null,
    lastLandmarkId: progress?.lastLandmarkId ?? null,
    lastLocalX: progress?.lastLocalX ?? null,
    lastLocalZ: progress?.lastLocalZ ?? null,
    discoveries: discoveries.map((d) => ({
      landmarkId: d.landmarkId,
      discoveredAt: d.discoveredAt.toISOString(),
    })),
  };
}
