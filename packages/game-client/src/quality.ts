export type QualityLevel = "low" | "medium" | "high";

export interface QualityConfig {
  /** [min, max] devicePixelRatio. */
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  /** Số người chơi render tối đa (mục 16.10). */
  maxPlayers: number;
  /** Số xe render tối đa (mục 16.10). */
  maxVehicles: number;
}

export const QUALITY: Record<QualityLevel, QualityConfig> = {
  low: { dpr: [1, 1], shadows: false, shadowMapSize: 512, antialias: false, maxPlayers: 15, maxVehicles: 12 },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, antialias: false, maxPlayers: 30, maxVehicles: 20 },
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, antialias: true, maxPlayers: 50, maxVehicles: 30 },
};

/**
 * Tự nhận diện cấu hình thiết bị (mục 12.2, T16):
 * - `navigator.hardwareConcurrency` < 4 → low
 * - pointer coarse hoặc màn < 900px → low
 * - hardwareConcurrency >= 8 và màn >= 1200px → high
 * - còn lại → medium
 */
export function detectQuality(): QualityLevel {
  if (typeof window === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = window.innerWidth < 900;
  if (coarse || narrow || cores < 4) return "low";
  if (cores >= 8 && window.innerWidth >= 1200) return "high";
  return "medium";
}
