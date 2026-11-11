import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/** UUIDv7 sinh ở ứng dụng (mục 7.11), không dùng gen_random_uuid(). */
export const pk = (name = "id") =>
  uuid(name)
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** `updated_at` do tầng ứng dụng cập nhật, không dùng trigger. */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Điều kiện CHECK `col IN (...)` từ danh sách enum dùng chung với zod. */
export const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(",")})`);

export type Position = [number, number];
export type GeoJsonPoint = { type: "Point"; coordinates: Position };
export type GeoJsonPolygon = { type: "Polygon"; coordinates: Position[][] };
export type GeoJsonMultiPolygon = { type: "MultiPolygon"; coordinates: Position[][][] };
export type GeoJson = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

type GeometryKind = "Point" | "Polygon" | "MultiPolygon";

/** Hình học SRID 4326, thứ tự tọa độ là [lon, lat]. Ghi bằng GeoJSON, đọc ra GeoJSON. */
function geometryColumn<T extends GeoJson>(kind: GeometryKind) {
  return customType<{ data: T; driverData: string; config: undefined }>({
    dataType: () => `geometry(${kind}, 4326)`,
    toDriver: (value) =>
      sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), 4326)` as unknown as string,
    fromDriver: (value) => parseEwkb(value) as T,
  });
}

export const point = geometryColumn<GeoJsonPoint>("Point");
export const polygon = geometryColumn<GeoJsonPolygon>("Polygon");
export const multiPolygon = geometryColumn<GeoJsonMultiPolygon>("MultiPolygon");

/** Đọc hex EWKB (định dạng mặc định của PostGIS) thành GeoJSON. */
export function parseEwkb(hex: string): GeoJson {
  const buf = Buffer.from(hex, "hex");
  let offset = 0;

  const readGeometry = (): GeoJson => {
    const little = buf.readUInt8(offset++) === 1;
    const u32 = () => {
      const v = little ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
      offset += 4;
      return v;
    };
    const f64 = () => {
      const v = little ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
      offset += 8;
      return v;
    };
    const typeWord = u32();
    if (typeWord & 0x20000000) u32(); // SRID
    const type = typeWord & 0xff;
    const pos = (): Position => [f64(), f64()];
    const ring = (): Position[] => Array.from({ length: u32() }, pos);
    const rings = (): Position[][] => Array.from({ length: u32() }, ring);

    if (type === 1) return { type: "Point", coordinates: pos() };
    if (type === 3) return { type: "Polygon", coordinates: rings() };
    if (type === 6) {
      const n = u32();
      const coordinates: Position[][][] = [];
      for (let i = 0; i < n; i++) {
        const g = readGeometry();
        if (g.type !== "Polygon") throw new Error("MultiPolygon chứa phần tử không phải Polygon");
        coordinates.push(g.coordinates);
      }
      return { type: "MultiPolygon", coordinates };
    }
    throw new Error(`Kiểu hình học EWKB ${type} chưa được hỗ trợ`);
  };

  return readGeometry();
}
