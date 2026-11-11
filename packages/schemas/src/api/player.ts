import { z } from "zod";
import { localeSchema } from "../base";
import { displayNameSchema } from "../display-name";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Cấu hình ngoại hình: chỉ nhận khóa đã biết, tối đa 2 KB khi tuần tự hóa (mục 9.8). */
export const appearanceConfigSchema = z
  .strictObject({
    skinTone: hexColor.optional(),
    hairColor: hexColor.optional(),
    outfitColor: hexColor.optional(),
  })
  .refine((v) => JSON.stringify(v).length <= 2048, { message: "appearance_too_large" });
export type AppearanceConfig = z.infer<typeof appearanceConfigSchema>;

export const countryCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  locale: localeSchema,
  countryCode: z.string().nullable(),
  bio: z.string().nullable(),
  emailVerified: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileBodySchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    locale: localeSchema.optional(),
    countryCode: countryCodeSchema.nullable().optional(),
    bio: z.string().trim().max(160).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const avatarSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  gender: z.enum(["male", "female"]),
  rig: z.string(),
  animationSet: z.string(),
  modelUrl: z.string(),
  thumbnailUrl: z.string(),
  contentVersion: z.number().int(),
});
export type AvatarDto = z.infer<typeof avatarSchema>;

export const characterSchema = z.object({
  id: z.uuid(),
  avatarId: z.uuid(),
  characterName: z.string().nullable(),
  appearanceConfig: appearanceConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CharacterDto = z.infer<typeof characterSchema>;

export const createCharacterBodySchema = z.strictObject({
  avatarId: z.uuid(),
  characterName: displayNameSchema.optional(),
  appearanceConfig: appearanceConfigSchema.default({}),
});

export const updateCharacterBodySchema = z
  .strictObject({
    avatarId: z.uuid().optional(),
    characterName: displayNameSchema.nullable().optional(),
    appearanceConfig: appearanceConfigSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const progressSchema = z.object({
  lastZoneId: z.uuid().nullable(),
  lastLandmarkId: z.uuid().nullable(),
  lastLocalX: z.number().nullable(),
  lastLocalZ: z.number().nullable(),
  discoveries: z.array(z.object({ landmarkId: z.uuid(), discoveredAt: z.string() })),
});
