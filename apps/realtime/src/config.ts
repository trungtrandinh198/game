import { DEFAULT_ROOM_CAPACITY, PROTOCOL_VERSION } from "@dnw/game-config";
import { z } from "zod";

const DEV_SECRET = "dev-only-realtime-ticket-secret-change-me-0123456789";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REALTIME_PORT: z.coerce.number().int().min(0).max(65535).default(2567),
  REALTIME_OPS_PORT: z.coerce.number().int().min(0).max(65535).default(2568),
  REALTIME_OPS_HOST: z.string().optional(),
  REALTIME_PUBLIC_URL: z.string().optional(),
  ROOM_CAPACITY: z.coerce.number().int().min(1).max(200).default(DEFAULT_ROOM_CAPACITY),
  PROTOCOL_VERSION: z.coerce.number().int().default(PROTOCOL_VERSION),
  REALTIME_TICKET_SECRET: z.string().min(32).optional(),
  ALLOW_DEV_TICKETS: z.enum(["true", "false"]).optional(),
  MAX_VEHICLES_PER_ROOM: z.coerce.number().int().min(0).max(200).optional(),
  REDIS_URL: z.string().optional(),
  REALTIME_DATABASE_URL: z.string().optional(),
  /** URL CDN (http/https) hoặc thư mục cục bộ chứa `zones/<zone>/v<N>/`. */
  MAP_SOURCE: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
});

export interface RealtimeConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  opsPort: number;
  opsHost: string;
  publicUrl: string;
  roomCapacity: number;
  protocolVersion: number;
  ticketSecret: string;
  /** Cho phép endpoint /dev/ticket và ticket mang tên/avatar tự khai (chỉ ngoài production). */
  allowDevTickets: boolean;
  maxVehiclesPerRoom: number | undefined;
  redisUrl: string | undefined;
  databaseUrl: string | undefined;
  /** Nguồn tệp bản đồ; không có thì không nạp được zone thật (chỉ còn sandbox). */
  mapSource: string | undefined;
}

export function loadConfig(raw: Record<string, string | undefined> = process.env): RealtimeConfig {
  // Biến để trống trong .env coi như chưa đặt.
  const env = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
  const parsed = envSchema.parse(env);
  const production = parsed.NODE_ENV === "production";
  if (production && !parsed.REALTIME_TICKET_SECRET) {
    throw new Error("REALTIME_TICKET_SECRET là bắt buộc ở production");
  }
  const allowDevTickets = parsed.ALLOW_DEV_TICKETS
    ? parsed.ALLOW_DEV_TICKETS === "true"
    : !production;
  if (production && allowDevTickets) {
    throw new Error("ALLOW_DEV_TICKETS không được bật ở production");
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.REALTIME_PORT,
    opsPort: parsed.REALTIME_OPS_PORT,
    opsHost: parsed.REALTIME_OPS_HOST ?? (production ? "127.0.0.1" : "0.0.0.0"),
    publicUrl: parsed.REALTIME_PUBLIC_URL ?? `ws://localhost:${parsed.REALTIME_PORT}`,
    roomCapacity: parsed.ROOM_CAPACITY,
    protocolVersion: parsed.PROTOCOL_VERSION,
    ticketSecret: parsed.REALTIME_TICKET_SECRET ?? DEV_SECRET,
    allowDevTickets,
    maxVehiclesPerRoom: parsed.MAX_VEHICLES_PER_ROOM,
    redisUrl: parsed.REDIS_URL || undefined,
    databaseUrl: parsed.REALTIME_DATABASE_URL || undefined,
    mapSource: parsed.MAP_SOURCE || parsed.CDN_BASE_URL || undefined,
  };
}
