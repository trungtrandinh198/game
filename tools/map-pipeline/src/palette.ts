/** Bảng màu vertex color (RGB 0--255). Màu nhà chọn theo hash của id OSM nên xác định. */
export const COLORS = {
  ground: [150, 168, 120] as const,
  park: [112, 160, 96] as const,
  road: [74, 78, 86] as const,
  pedestrian: [176, 170, 160] as const,
  sidewalk: [196, 190, 180] as const,
  water: [64, 140, 190] as const,
};

const BUILDING_PALETTE: readonly (readonly [number, number, number])[] = [
  [226, 206, 178],
  [210, 190, 160],
  [196, 180, 170],
  [232, 220, 196],
  [188, 170, 150],
  [214, 196, 182],
  [200, 184, 164],
  [222, 208, 190],
];

/** FNV-1a 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function buildingColor(id: string): readonly [number, number, number] {
  return BUILDING_PALETTE[hashString(id) % BUILDING_PALETTE.length]!;
}

/** Bộ sinh số ngẫu nhiên xác định (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
