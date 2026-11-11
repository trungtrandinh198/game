import proj4 from "proj4";

/** UTM zone 49N phủ Đà Nẵng (EPSG:32649). */
const UTM_49N = "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs";

export interface ZoneOrigin {
  lon: number;
  lat: number;
}

export interface Projector {
  /** +X Đông, -Z Bắc (mục 16.7). */
  toLocal(lon: number, lat: number): { x: number; z: number };
  toGeo(x: number, z: number): { lon: number; lat: number };
}

export function createProjector(origin: ZoneOrigin): Projector {
  const forward = proj4("EPSG:4326", UTM_49N);
  const [e0, n0] = forward.forward([origin.lon, origin.lat]) as [number, number];
  return {
    toLocal(lon, lat) {
      const [e, n] = forward.forward([lon, lat]) as [number, number];
      return { x: e - e0, z: -(n - n0) };
    },
    toGeo(x, z) {
      const [lon, lat] = forward.inverse([e0 + x, n0 - z]) as [number, number];
      return { lon, lat };
    },
  };
}

const cache = new Map<string, Projector>();

function projectorFor(origin: ZoneOrigin): Projector {
  const key = `${origin.lon},${origin.lat}`;
  let projector = cache.get(key);
  if (!projector) {
    projector = createProjector(origin);
    cache.set(key, projector);
  }
  return projector;
}

/** Chuyển (lon, lat) sang tọa độ local của zone. Thứ tự tham số là lon trước, lat sau. */
export function toLocal(origin: ZoneOrigin, lon: number, lat: number): { x: number; z: number } {
  return projectorFor(origin).toLocal(lon, lat);
}

export function toGeo(origin: ZoneOrigin, x: number, z: number): { lon: number; lat: number } {
  return projectorFor(origin).toGeo(x, z);
}
