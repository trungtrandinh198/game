import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const fileRef = z.object({
  url: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: hash,
});

export const boundsSchema = z.object({
  minX: z.number(),
  minZ: z.number(),
  maxX: z.number(),
  maxZ: z.number(),
});

/** Vật thể đặt lặp (cây, đèn): client dựng bằng InstancedMesh. */
export const chunkInstanceSchema = z.object({
  type: z.string(),
  x: z.number(),
  z: z.number(),
  rotY: z.number(),
  scale: z.number(),
});

export const chunkManifestSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().regex(/^x-?\d+_z-?\d+$/),
  bounds: boundsSchema,
  glb: fileRef,
  collision: fileRef,
  surface: fileRef,
  instances: z.array(chunkInstanceSchema),
  landmarks: z.array(z.string()),
  stats: z.object({ buildingCount: z.number().int(), triangleCount: z.number().int() }),
});
export type ChunkManifest = z.infer<typeof chunkManifestSchema>;

export const zoneIndexSchema = z.object({
  schemaVersion: z.literal(1),
  zoneCode: z.string(),
  mapVersion: z.number().int().min(1),
  chunkSizeM: z.number().int(),
  crs: z.string(),
  origin: z.object({ lon: z.number(), lat: z.number() }),
  bounds: boundsSchema,
  chunks: z.array(
    z.object({
      code: z.string(),
      gx: z.number().int(),
      gz: z.number().int(),
      manifest: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      sha256: hash,
    }),
  ),
});
export type ZoneIndex = z.infer<typeof zoneIndexSchema>;

export const collisionFileSchema = z.object({
  schemaVersion: z.literal(1),
  unit: z.literal("cm"),
  segments: z.array(
    z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
  ),
});

/** `overrides.json` của zone: sửa tay dữ liệu OSM. */
export const mapOverridesSchema = z.object({
  schemaVersion: z.literal(1),
  buildings: z
    .array(
      z.object({
        id: z.string(),
        height: z.number().positive().optional(),
        levels: z.number().positive().optional(),
      }),
    )
    .default([]),
  removeFeatures: z.array(z.string()).default([]),
});

/** Header `surface.bin` (mục 16.9). */
export const SURFACE_MAGIC = "DNSF";
export const SURFACE_HEADER_BYTES = 10;
export const SURFACE_VALUES = { ground: 0, pedestrian: 1, road: 2 } as const;
