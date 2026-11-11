export type Ring = [number, number][];
export type PolygonCoords = Ring[];

/** Gom mọi polygon (mỗi polygon là danh sách vòng, vòng đầu là biên ngoài) từ một GeoJSON. */
export function extractPolygons(geojson: unknown): PolygonCoords[] {
  const out: PolygonCoords[] = [];
  const visit = (g: unknown): void => {
    if (!g || typeof g !== "object") return;
    const obj = g as {
      type?: string;
      coordinates?: unknown;
      geometry?: unknown;
      features?: unknown[];
      geometries?: unknown[];
    };
    switch (obj.type) {
      case "Polygon":
        out.push(obj.coordinates as PolygonCoords);
        break;
      case "MultiPolygon":
        out.push(...(obj.coordinates as PolygonCoords[]));
        break;
      case "Feature":
        visit(obj.geometry);
        break;
      case "FeatureCollection":
        obj.features?.forEach(visit);
        break;
      case "GeometryCollection":
        obj.geometries?.forEach(visit);
        break;
    }
  };
  visit(geojson);
  return out;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Điểm (lon, lat) nằm trong một trong các polygon (có tính lỗ). */
export function pointInPolygons(lon: number, lat: number, polygons: PolygonCoords[]): boolean {
  return polygons.some(
    ([outer, ...holes]) =>
      outer !== undefined && inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)),
  );
}
