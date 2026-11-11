import osmtogeojson from "osmtogeojson";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { createProjector } from "@dnw/game-core";
import {
  cleanRing,
  polyArea,
  simplifyRing,
  union,
  type MultiPoly,
  type Poly,
  type Pt,
  type Ring,
} from "./geom";

export interface BuildingFeature {
  id: string;
  poly: Poly;
  tags: Record<string, string>;
}
export interface RoadFeature {
  id: string;
  line: Pt[];
  highway: string;
  width: number;
  bridge: boolean;
  tags: Record<string, string>;
}
export interface TreePoint {
  id: string;
  x: number;
  z: number;
}

export interface MapFeatures {
  buildings: BuildingFeature[];
  roads: RoadFeature[];
  water: MultiPoly;
  parks: MultiPoly;
  trees: TreePoint[];
}

/** Bề rộng mặc định theo loại đường (mục 16.9). */
export const ROAD_WIDTH: Record<string, number> = {
  motorway: 14,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  unclassified: 6,
  residential: 6,
  living_street: 5,
  service: 4,
  footway: 2.5,
  pedestrian: 2.5,
  path: 2,
  cycleway: 2.5,
  steps: 2,
  track: 3,
};

const ROAD_LINK = /_link$/;

export function roadWidth(highway: string, tags: Record<string, string>): number {
  const explicit = Number.parseFloat(tags["width"] ?? "");
  if (Number.isFinite(explicit) && explicit > 0.5 && explicit < 60) return explicit;
  const lanes = Number.parseInt(tags["lanes"] ?? "", 10);
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(30, lanes * 3.2);
  return ROAD_WIDTH[highway.replace(ROAD_LINK, "")] ?? 5;
}

const MIN_AREA = 1;
const SIMPLIFY = 0.1;

type Project = (lon: number, lat: number) => Pt;

function polysFrom(geometry: Geometry | null, project: Project): Poly[] {
  const polys: Poly[] = [];
  const conv = (rings: number[][][]): Poly =>
    rings.map((r) => simplifyRing(cleanRing(r.map(([lon, lat]) => project(lon!, lat!))), SIMPLIFY));
  if (geometry?.type === "Polygon") polys.push(conv(geometry.coordinates));
  else if (geometry?.type === "MultiPolygon")
    for (const c of geometry.coordinates) polys.push(conv(c));
  return polys.filter((p) => p[0] !== undefined && p[0].length >= 4);
}

/** Chuyển OSM JSON sang đối tượng có kiểu, tọa độ local, đã chuẩn hóa (bước 2--5 của mục 16.8). */
export function extractFeatures(osm: unknown, origin: { lon: number; lat: number }): MapFeatures {
  const projector = createProjector(origin);
  const project: Project = (lon, lat) => {
    const p = projector.toLocal(lon, lat);
    return [Math.round(p.x * 1000) / 1000, Math.round(p.z * 1000) / 1000];
  };
  const fc = osmtogeojson(osm as Parameters<typeof osmtogeojson>[0]) as FeatureCollection;
  const out: MapFeatures = { buildings: [], roads: [], water: [], parks: [], trees: [] };
  const waterParts: MultiPoly[] = [];
  const parkParts: MultiPoly[] = [];

  const features = [...fc.features].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const f of features as Feature[]) {
    const tags = (f.properties ?? {}) as Record<string, string>;
    const id = String(f.id ?? f.properties?.["id"] ?? "");
    const g = f.geometry;

    if (tags["building"] && tags["building"] !== "no") {
      for (const raw of polysFrom(g, project)) {
        // union() sửa vòng tự cắt và có thể tách thành nhiều polygon
        for (const poly of union([raw])) {
          if (polyArea(poly) >= MIN_AREA) out.buildings.push({ id, poly, tags });
        }
      }
    } else if (tags["highway"] && g?.type === "LineString") {
      const highway = tags["highway"];
      if (highway in ROAD_WIDTH || ROAD_LINK.test(highway)) {
        const line = g.coordinates.map(([lon, lat]) => project(lon!, lat!));
        if (line.length >= 2) {
          const bridge = tags["bridge"] !== undefined && tags["bridge"] !== "no";
          out.roads.push({ id, line, highway, width: roadWidth(highway, tags), bridge, tags });
        }
      }
    } else if (
      tags["natural"] === "water" ||
      tags["waterway"] === "riverbank" ||
      tags["landuse"] === "reservoir"
    ) {
      const polys = polysFrom(g, project).filter((p) => polyArea(p) >= MIN_AREA);
      if (polys.length > 0) waterParts.push(polys);
    } else if (tags["leisure"] === "park" || tags["leisure"] === "garden") {
      const polys = polysFrom(g, project).filter((p) => polyArea(p) >= MIN_AREA);
      if (polys.length > 0) parkParts.push(polys);
    } else if (tags["natural"] === "tree" && g?.type === "Point") {
      const [x, z] = project(g.coordinates[0]!, g.coordinates[1]!);
      out.trees.push({ id, x, z });
    }
  }
  out.water = union(...waterParts);
  out.parks = union(...parkParts);
  return out;
}

export type { Ring };
