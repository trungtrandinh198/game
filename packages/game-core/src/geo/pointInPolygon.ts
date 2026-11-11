export type Ring = readonly (readonly [number, number])[];
/** Vòng đầu là vòng ngoài, các vòng sau là lỗ. */
export type Polygon = readonly Ring[];

function inRing(x: number, z: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses =
      a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, z: number, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !inRing(x, z, outer)) return false;
  return !holes.some((hole) => inRing(x, z, hole));
}

export function pointInMultiPolygon(x: number, z: number, polygons: readonly Polygon[]): boolean {
  return polygons.some((polygon) => pointInPolygon(x, z, polygon));
}
