import { z } from "zod";
import { VEHICLE_KINDS } from "../base";

/** `id` kebab-case ổn định; là khóa logic (avatars.code, vehicle_types.code, ...). */
export const contentIdSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id phải là kebab-case");

export const versionSchema = z.number().int().min(1);

export const licenseInfoSchema = z.object({
  author: z.string().min(1),
  license: z.string().min(1),
  sourceUrl: z.string().min(1).optional(),
});
export type LicenseInfo = z.infer<typeof licenseInfoSchema>;

const fileName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w./-]+$/, "tên file không hợp lệ");
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const lonSchema = z.number().min(-180).max(180);
const latSchema = z.number().min(-90).max(90);

export const REQUIRED_CLIPS = [
  "idle",
  "walk",
  "run",
  "ride_bicycle",
  "ride_motorbike",
  "sit_car",
] as const;

export const rigManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  bones: z.array(z.string()).min(10),
  requiredClips: z.array(z.string()).min(1),
  maxBones: z.number().int().positive(),
});

export const characterManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: contentIdSchema,
  version: versionSchema,
  gender: z.enum(["male", "female"]),
  rig: z.string().min(1),
  model: fileName,
  thumbnail: fileName,
  clips: z.record(z.string(), z.string()),
  license: licenseInfoSchema,
});
export type CharacterManifest = z.infer<typeof characterManifestSchema>;

export const vehicleHandlingSchema = z.object({
  maxSpeed: z.number().positive(),
  maxReverseSpeed: z.number().nonnegative(),
  acceleration: z.number().positive(),
  brakeDecel: z.number().positive(),
  drag: z.number().nonnegative(),
  wheelbase: z.number().positive(),
  maxSteerDeg: z.number().positive().max(60),
  highSpeedSteerFactor: z.number().positive().max(1),
});

export const vehicleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: contentIdSchema,
  version: versionSchema,
  kind: z.enum(VEHICLE_KINDS),
  model: fileName,
  lod1: fileName.optional(),
  thumbnail: fileName,
  nodes: z.object({ wheels: z.array(z.string()).min(2), steer: z.string().optional() }),
  seats: z
    .array(
      z.object({
        id: z.string(),
        socket: z.string(),
        pose: z.string(),
        hideRider: z.boolean(),
        riderOffset: z.object({ position: vec3, rotationY: z.number() }),
      }),
    )
    .min(1),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  handling: vehicleHandlingSchema,
  surfaceSpeedFactor: z.object({
    road: z.number().min(0).max(1),
    pedestrian: z.number().min(0).max(1),
    ground: z.number().min(0).max(1),
  }),
  license: licenseInfoSchema,
});
export type VehicleManifest = z.infer<typeof vehicleManifestSchema>;

export const landmarkManifestSchema = z.object({
  schemaVersion: z.literal(1),
  code: contentIdSchema,
  version: versionSchema.default(1),
  zone: contentIdSchema,
  category: contentIdSchema,
  location: z.object({ lon: lonSchema, lat: latSchema }),
  interactionRadiusM: z.number().positive().max(200).default(25),
  rotationY: z.number().default(0),
  scale: z.number().positive().default(1),
  model: fileName,
  lods: z.array(z.object({ file: fileName, distance: z.number().positive() })).default([]),
  replacesOsmBuildings: z.array(z.string()).default([]),
  cover: fileName.optional(),
  license: licenseInfoSchema,
});
export type LandmarkManifest = z.infer<typeof landmarkManifestSchema>;

export const landmarkI18nSchema = z.object({
  name: z.string().min(1).max(200),
  shortDescription: z.string().max(500).default(""),
  description: z.string().default(""),
  addressText: z.string().max(300).optional(),
  historicalNote: z.string().optional(),
});
export type LandmarkI18n = z.infer<typeof landmarkI18nSchema>;

export const mediaManifestSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(
    z.object({
      file: fileName,
      copyrightCredit: z.string().min(1),
      license: z.string().min(1),
      sourceUrl: z.string().optional(),
      alt: z.object({ vi: z.string(), en: z.string() }),
    }),
  ),
});

export const zoneManifestSchema = z.object({
  schemaVersion: z.literal(1),
  code: contentIdSchema,
  name: z.string().min(1).max(150),
  origin: z.object({ lon: lonSchema, lat: latSchema }),
  crs: z.string().default("EPSG:32649"),
  chunkSizeM: z.number().int().min(64).max(1024).default(256),
  boundary: fileName,
  license: licenseInfoSchema.optional(),
});
export type ZoneManifest = z.infer<typeof zoneManifestSchema>;

export const spawnPointsFileSchema = z.object({
  schemaVersion: z.literal(1),
  spawns: z.array(
    z.object({
      id: contentIdSchema,
      lon: lonSchema,
      lat: latSchema,
      headingDeg: z.number().default(0),
    }),
  ),
});

export const vehicleSpawnsFileSchema = z.object({
  schemaVersion: z.literal(1),
  spawns: z.array(
    z.object({
      id: contentIdSchema,
      vehicle: contentIdSchema,
      lon: lonSchema,
      lat: latSchema,
      headingDeg: z.number().default(0),
      respawnSeconds: z.number().int().min(30).default(120),
    }),
  ),
});

export const propManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: contentIdSchema,
  version: versionSchema,
  model: fileName,
  instanced: z.boolean().default(true),
  collision: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("none") }),
      z.object({ type: z.literal("circle"), radius: z.number().positive().max(10) }),
    ])
    .default({ type: "none" }),
  license: licenseInfoSchema,
});
export type PropManifest = z.infer<typeof propManifestSchema>;

export const CONTENT_KINDS = ["character", "vehicle", "landmark", "zone", "prop"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
