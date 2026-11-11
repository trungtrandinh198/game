import { z } from "zod";

/** Client gửi 20 Hz; mỗi input tương ứng đúng một bước mô phỏng ở server (mục 8.7). */
export const inputMessageSchema = z.object({
  seq: z.number().int().nonnegative().max(0xffffffff),
  moveX: z.number().min(-1).max(1),
  moveZ: z.number().min(-1).max(1),
  run: z.boolean(),
  yaw: z
    .number()
    .min(-4 * Math.PI)
    .max(4 * Math.PI),
});
export type InputMessage = z.infer<typeof inputMessageSchema>;

export const driveMessageSchema = z.object({
  seq: z.number().int().nonnegative().max(0xffffffff),
  throttle: z.number().min(-1).max(1),
  steer: z.number().min(-1).max(1),
  handbrake: z.boolean(),
});
export type DriveMessage = z.infer<typeof driveMessageSchema>;

export const mountMessageSchema = z.object({ vehicleId: z.string().min(1).max(64) });
export type MountMessage = z.infer<typeof mountMessageSchema>;

export const discoverMessageSchema = z.object({ landmarkCode: z.string().min(1).max(100) });
export type DiscoverMessage = z.infer<typeof discoverMessageSchema>;

export const joinOptionsSchema = z.object({
  ticket: z.string().min(10).max(4096),
  zoneCode: z.string().min(1).max(80),
  protocolVersion: z.number().int(),
});
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

/** Claim của join ticket (mục 8.8). `dn`/`av` chỉ dùng ở môi trường development. */
export const ticketClaimsSchema = z.object({
  sub: z.string().min(1).max(64),
  jti: z.string().min(8).max(64),
  zone: z.string().min(1).max(80),
  pv: z.number().int(),
  dn: z.string().min(1).max(32).optional(),
  av: z.string().min(1).max(80).optional(),
});
export type TicketClaims = z.infer<typeof ticketClaimsSchema>;

export const TICKET_ISSUER = "dnw-api";
export const TICKET_AUDIENCE = "dnw-realtime";

export const NOTICE_CODES = [
  "VEHICLE_TOO_FAR",
  "VEHICLE_OCCUPIED",
  "VEHICLE_NOT_FOUND",
  "VEHICLE_TOO_FAST",
  "VEHICLE_NO_DISMOUNT_SPACE",
  "VEHICLE_COOLDOWN",
  "NOT_ON_FOOT",
  "NOT_DRIVING",
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export interface NoticeMessage {
  code: NoticeCode;
}
