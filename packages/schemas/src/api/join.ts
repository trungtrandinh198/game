import { z } from "zod";

export const joinBodySchema = z.object({ zoneCode: z.string().min(2).max(80) });

export const joinResponseSchema = z.object({
  ticket: z.string(),
  realtimeUrl: z.string(),
  roomName: z.literal("city"),
  zoneCode: z.string(),
  protocolVersion: z.number().int(),
});
export type JoinResponse = z.infer<typeof joinResponseSchema>;
