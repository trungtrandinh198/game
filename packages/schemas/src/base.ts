import { z } from "zod";

export const LOCALES = ["vi", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const USER_STATUSES = ["pending", "active", "suspended", "banned"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const VEHICLE_KINDS = ["bicycle", "motorbike", "car"] as const;
export const vehicleKindSchema = z.enum(VEHICLE_KINDS);
export type VehicleKind = z.infer<typeof vehicleKindSchema>;
