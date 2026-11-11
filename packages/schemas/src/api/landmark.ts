import { z } from "zod";

export const landmarkMediaSchema = z.object({
  id: z.string(),
  mediaType: z.enum(["image", "video"]),
  url: z.string(),
  altText: z.record(z.string(), z.string()),
  copyrightCredit: z.string(),
  license: z.string(),
  sourceUrl: z.string().nullable(),
});
export type LandmarkMediaDto = z.infer<typeof landmarkMediaSchema>;

export const landmarkSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  shortDescription: z.string(),
  description: z.string().optional(),
  addressText: z.string().nullable().optional(),
  historicalNote: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable(),
  media: z.array(landmarkMediaSchema).optional(),
  localeUsed: z.enum(["vi", "en"]),
});
export type LandmarkDto = z.infer<typeof landmarkSchema>;

export const landmarkListSchema = z.object({ items: z.array(landmarkSchema) });

export const zoneLandmarkSchema = z.object({
  code: z.string(),
  name: z.string(),
  shortDescription: z.string(),
  localX: z.number(),
  localZ: z.number(),
  interactionRadiusM: z.number(),
  coverImageUrl: z.string().nullable(),
  localeUsed: z.enum(["vi", "en"]),
});
export type ZoneLandmarkDto = z.infer<typeof zoneLandmarkSchema>;

export const zoneLandmarkListSchema = z.object({ items: z.array(zoneLandmarkSchema) });
