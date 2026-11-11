import { z } from "zod";

/** Giá trị enum dùng chung cho Drizzle (CHECK) và zod (mục 7.11). */
export const GENDERS = ["male", "female"] as const;
export const EMAIL_TOKEN_TYPES = ["verify_email", "reset_password"] as const;
export const ZONE_STATUSES = ["draft", "active", "disabled"] as const;
export const CHUNK_STATUSES = ["draft", "published"] as const;
export const LANDMARK_STATUSES = ["draft", "published", "archived"] as const;
export const REVIEW_STATUSES = ["draft", "reviewed"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;
export const ROOM_STATUSES = ["active", "draining", "closed"] as const;
export const REPORT_STATUSES = ["open", "reviewing", "resolved", "rejected"] as const;
export const MODERATION_ACTIONS = ["mute", "kick", "suspend", "ban", "unban"] as const;

export const genderSchema = z.enum(GENDERS);
export const zoneStatusSchema = z.enum(ZONE_STATUSES);
export const landmarkStatusSchema = z.enum(LANDMARK_STATUSES);

export type Gender = (typeof GENDERS)[number];
export type ZoneStatus = (typeof ZONE_STATUSES)[number];
export type LandmarkStatus = (typeof LANDMARK_STATUSES)[number];
