export type QualityLevel = "low" | "medium" | "high";

export interface QualityConfig {
  /** [min, max] devicePixelRatio. */
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
}

export const QUALITY: Record<QualityLevel, QualityConfig> = {
  low: { dpr: [1, 1], shadows: false, shadowMapSize: 512, antialias: false },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, antialias: false },
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, antialias: true },
};

/** Điện thoại/cảm ứng bắt đầu ở mức thấp; mục 12.2 yêu cầu giảm bóng trên mobile. */
export function detectQuality(): QualityLevel {
  if (typeof window === "undefined") return "medium";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || window.innerWidth < 900 ? "low" : "medium";
}
