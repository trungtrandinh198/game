import { z } from "zod";

export const vehicleTypeSchema = z.object({
  code: z.string(),
  kind: z.enum(["bicycle", "motorbike", "car"]),
  modelUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  contentVersion: z.number().int(),
});
export type VehicleTypeDto = z.infer<typeof vehicleTypeSchema>;

export const vehicleTypeListSchema = z.object({ items: z.array(vehicleTypeSchema) });
