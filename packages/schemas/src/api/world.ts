import { z } from "zod";

export const zoneSchema = z.object({
  code: z.string(),
  name: z.string(),
  mapVersion: z.number().int(),
  chunkSizeM: z.number().int(),
  crs: z.string(),
  origin: z.object({ lon: z.number(), lat: z.number() }),
  indexUrl: z.string(),
});
export type ZoneDto = z.infer<typeof zoneSchema>;

export const zoneListSchema = z.object({ items: z.array(zoneSchema) });
