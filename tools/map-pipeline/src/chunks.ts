import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, quantize } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import {
  bufferLine,
  boxPoly,
  boxesOverlap,
  centroid,
  difference,
  intersection,
  multiBox,
  multiContains,
  polyContains,
  ringBox,
  union,
  type Box,
  type MultiPoly,
  type Poly,
  type Pt,
} from "./geom";
import { addExtrusion, addFlat, newMesh, triangleCount, type MeshBuilder } from "./mesh";
import { buildingColor, COLORS, hashString, rng } from "./palette";
import type { BuildingFeature, MapFeatures, RoadFeature } from "./osm";

export interface LandmarkSpec {
  code: string;
  x: number;
  z: number;
  rotationY: number;
  /** Vòng footprint va chạm trong tọa độ local (đã xoay/đặt). */
  footprint: Pt[];
  replacesOsmBuildings: string[];
}

export interface ZoneSpec {
  code: string;
  chunkSizeM: number;
  /** Biên zone trong tọa độ local. */
  boundary: MultiPoly;
}

export interface Instance {
  type: "tree-01" | "street-lamp-01";
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

export interface ChunkOutput {
  code: string;
  gx: number;
  gz: number;
  bounds: Box;
  glb: Uint8Array;
  collision: { schemaVersion: 1; unit: "cm"; segments: number[][] };
  surface: Uint8Array;
  instances: Instance[];
  landmarks: string[];
  stats: { buildingCount: number; triangleCount: number };
}

export const SURFACE_CELL_M = 2;
const PEDESTRIAN = new Set(["footway", "pedestrian", "path", "steps", "cycleway"]);
const NO_SIDEWALK = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "service",
  "track",
]);

const DEFAULT_HEIGHT: Record<string, number> = {
  house: 7,
  residential: 7,
  detached: 7,
  apartments: 24,
  commercial: 15,
  retail: 15,
  office: 15,
};

/** Chiều cao nhà: `height` > `building:levels * 3.2` > mặc định theo loại; kẹp 3--200 m (mục 16.9). */
export function buildingHeight(tags: Record<string, string>): number {
  const explicit = Number.parseFloat((tags["height"] ?? "").replace(",", "."));
  let h: number;
  if (Number.isFinite(explicit) && explicit > 0) h = explicit;
  else {
    const levels = Number.parseFloat(tags["building:levels"] ?? "");
    h =
      Number.isFinite(levels) && levels > 0
        ? levels * 3.2
        : (DEFAULT_HEIGHT[tags["building"] ?? ""] ?? 9);
  }
  return Math.min(200, Math.max(3, h));
}

export const chunkCode = (gx: number, gz: number) => `x${gx}_z${gz}`;

interface RoadGeometry {
  road: RoadFeature;
  box: Box;
  area: MultiPoly;
}

const expandBox = (b: Box, m: number): Box => ({
  minX: b.minX - m,
  minZ: b.minZ - m,
  maxX: b.maxX + m,
  maxZ: b.maxZ + m,
});

function ringSegments(poly: Poly): [Pt, Pt][] {
  return poly.flatMap((ring) => ring.slice(0, -1).map((p, i) => [p, ring[i + 1]!] as [Pt, Pt]));
}

const onBoxEdge = (p: Pt, b: Box) =>
  Math.abs(p[0] - b.minX) < 1e-6 ||
  Math.abs(p[0] - b.maxX) < 1e-6 ||
  Math.abs(p[1] - b.minZ) < 1e-6 ||
  Math.abs(p[1] - b.maxZ) < 1e-6;

/** Đoạn nằm dọc biên chunk (do việc cắt tạo ra) không phải vật cản thật. */
function isBoxArtifact(a: Pt, b: Pt, box: Box): boolean {
  return (
    ((Math.abs(a[0] - b[0]) < 1e-6 &&
      (Math.abs(a[0] - box.minX) < 1e-6 || Math.abs(a[0] - box.maxX) < 1e-6)) ||
      (Math.abs(a[1] - b[1]) < 1e-6 &&
        (Math.abs(a[1] - box.minZ) < 1e-6 || Math.abs(a[1] - box.maxZ) < 1e-6))) &&
    onBoxEdge(a, box) &&
    onBoxEdge(b, box)
  );
}

const cm = (v: number) => Math.round(v * 100);

/** Dựng toàn bộ chunk của zone (bước 6--10 của mục 16.8). Không phụ thuộc thời gian nên đầu ra xác định. */
export async function buildChunks(
  features: MapFeatures,
  zone: ZoneSpec,
  landmarks: LandmarkSpec[],
): Promise<ChunkOutput[]> {
  const cs = zone.chunkSizeM;
  const replaced = new Set(landmarks.flatMap((l) => l.replacesOsmBuildings));
  const buildings = features.buildings.filter((b) => !replaced.has(b.id));

  // Hình học đường dùng chung cho mọi chunk
  const roadGeoms: RoadGeometry[] = features.roads.map((road) => {
    const area = bufferLine(road.line, road.width);
    return {
      road,
      area,
      box: area.length ? multiBox(area) : { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
    };
  });
  const bridgeArea = union(
    ...roadGeoms.filter((g) => g.road.bridge).map((g) => bufferLine(g.road.line, g.road.width + 2)),
  );
  const waterWalkable = difference(features.water, bridgeArea);

  const zoneBox = multiBox(zone.boundary);
  // Biên zone sinh từ lon/lat làm tròn có sai số cm; dung sai 0.1 m để không sinh thêm chunk rỗng ở rìa.
  const EPS = 0.1;
  const gxMin = Math.floor((zoneBox.minX + EPS) / cs),
    gxMax = Math.ceil((zoneBox.maxX - EPS) / cs) - 1;
  const gzMin = Math.floor((zoneBox.minZ + EPS) / cs),
    gzMax = Math.ceil((zoneBox.maxZ - EPS) / cs) - 1;

  // Cây và đèn: điểm OSM + sinh theo đường, lọc điểm rơi vào nhà/đường/nước
  const buildingIndex = new Map<string, BuildingFeature[]>();
  const cellKey = (x: number, z: number) => `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
  for (const b of buildings) {
    const bb = ringBox(b.poly[0]!);
    for (let cx = Math.floor(bb.minX / 32); cx <= Math.floor(bb.maxX / 32); cx++) {
      for (let cz = Math.floor(bb.minZ / 32); cz <= Math.floor(bb.maxZ / 32); cz++) {
        const k = `${cx},${cz}`;
        (buildingIndex.get(k) ?? buildingIndex.set(k, []).get(k)!).push(b);
      }
    }
  }
  const blocked = (x: number, z: number) =>
    (buildingIndex.get(cellKey(x, z)) ?? []).some((b) => polyContains(x, z, b.poly)) ||
    roadGeoms.some(
      (g) =>
        x >= g.box.minX &&
        x <= g.box.maxX &&
        z >= g.box.minZ &&
        z <= g.box.maxZ &&
        multiContains(x, z, g.area),
    ) ||
    multiContains(x, z, features.water);

  const instances: Instance[] = [];
  for (const t of features.trees)
    if (!blocked(t.x, t.z)) instances.push({ type: "tree-01", x: t.x, z: t.z, rotY: 0, scale: 1 });
  for (const { road } of roadGeoms) {
    if (NO_SIDEWALK.has(road.highway) || PEDESTRIAN.has(road.highway) || road.bridge) continue;
    const rand = rng(hashString(`${zone.code}:${road.id}`));
    let treeLeft = 6 + rand() * 6,
      lampLeft = 10 + rand() * 10;
    for (let i = 0; i < road.line.length - 1; i++) {
      const [x0, z0] = road.line[i]!;
      const [x1, z1] = road.line[i + 1]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const ux = (x1 - x0) / len,
        uz = (z1 - z0) / len;
      const off = road.width / 2 + 3;
      let s = 0;
      while (s < len) {
        const step = Math.min(treeLeft, lampLeft, len - s);
        s += step;
        treeLeft -= step;
        lampLeft -= step;
        const px = x0 + ux * s,
          pz = z0 + uz * s;
        if (treeLeft <= 1e-9) {
          treeLeft = 12 + rand() * 3;
          const x = px - uz * off,
            z = pz + ux * off;
          if (!blocked(x, z))
            instances.push({
              type: "tree-01",
              x: round2(x),
              z: round2(z),
              rotY: round2(rand() * Math.PI * 2),
              scale: round2(0.85 + rand() * 0.3),
            });
        }
        if (lampLeft <= 1e-9) {
          lampLeft = 25;
          const x = px + uz * off,
            z = pz - ux * off;
          if (!blocked(x, z))
            instances.push({
              type: "street-lamp-01",
              x: round2(x),
              z: round2(z),
              rotY: 0,
              scale: 1,
            });
        }
        if (s >= len) break;
      }
      treeLeft = Math.max(treeLeft, 0.5);
    }
  }

  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const out: ChunkOutput[] = [];

  for (let gx = gxMin; gx <= gxMax; gx++) {
    for (let gz = gzMin; gz <= gzMax; gz++) {
      const bounds: Box = {
        minX: gx * cs,
        minZ: gz * cs,
        maxX: (gx + 1) * cs,
        maxZ: (gz + 1) * cs,
      };
      const box = boxPoly(bounds);
      const near = expandBox(bounds, 20);
      const inChunk = (x: number, z: number) =>
        x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;

      const waterC = intersection(features.water, box);
      const groundC = difference(box, waterC);
      const parkC = intersection(intersection(features.parks, box), groundC);

      const nearRoads = roadGeoms.filter((g) => g.area.length && boxesOverlap(g.box, near));
      const roadsC = intersection(
        union(...nearRoads.filter((g) => !PEDESTRIAN.has(g.road.highway)).map((g) => g.area)),
        box,
      );
      const pedC = difference(
        intersection(
          union(...nearRoads.filter((g) => PEDESTRIAN.has(g.road.highway)).map((g) => g.area)),
          box,
        ),
        roadsC,
      );
      const sidewalkBase = union(
        ...nearRoads
          .filter(
            (g) =>
              !NO_SIDEWALK.has(g.road.highway) && !PEDESTRIAN.has(g.road.highway) && !g.road.bridge,
          )
          .map((g) => bufferLine(g.road.line, g.road.width + 4)),
      );
      const sidewalkC = difference(
        difference(difference(intersection(sidewalkBase, box), roadsC), waterC),
        pedC,
      );

      const chunkBuildings = buildings.filter((b) => {
        const [cx, cz] = centroid(b.poly[0]!);
        return inChunk(cx, cz);
      });
      const chunkLandmarks = landmarks.filter((l) => inChunk(l.x, l.z));

      const solid: MeshBuilder = newMesh();
      addFlat(solid, groundC, 0, COLORS.ground);
      addFlat(solid, parkC, 0.01, COLORS.park);
      addFlat(solid, roadsC, 0.02, COLORS.road);
      addFlat(solid, pedC, 0.03, COLORS.pedestrian);
      addFlat(solid, sidewalkC, 0.05, COLORS.sidewalk);
      for (const b of chunkBuildings) {
        const wall = buildingColor(b.id);
        addExtrusion(
          solid,
          b.poly,
          buildingHeight(b.tags),
          wall,
          [wall[0] * 0.8, wall[1] * 0.8, wall[2] * 0.8].map(Math.round) as [number, number, number],
        );
      }
      const water: MeshBuilder = newMesh();
      addFlat(water, waterC, -0.3, COLORS.water);

      const segments: number[][] = [];
      const addSeg = (a: Pt, b: Pt) => segments.push([cm(a[0]), cm(a[1]), cm(b[0]), cm(b[1])]);
      for (const b of chunkBuildings) for (const [a, c] of ringSegments(b.poly)) addSeg(a, c);
      for (const l of chunkLandmarks)
        for (let i = 0; i < l.footprint.length - 1; i++)
          addSeg(l.footprint[i]!, l.footprint[i + 1]!);
      for (const poly of intersection(waterWalkable, box)) {
        for (const [a, c] of ringSegments(poly)) if (!isBoxArtifact(a, c, bounds)) addSeg(a, c);
      }

      const surface = rasterize(bounds, roadsC, [pedC, sidewalkC]);
      const chunkInstances = instances
        .filter((i) => inChunk(i.x, i.z))
        .sort((a, b) => a.type.localeCompare(b.type) || a.x - b.x || a.z - b.z);

      const glb = await writeGlb(io, solid, water);
      out.push({
        code: chunkCode(gx, gz),
        gx,
        gz,
        bounds,
        glb,
        collision: { schemaVersion: 1, unit: "cm", segments },
        surface,
        instances: chunkInstances,
        landmarks: chunkLandmarks.map((l) => l.code).sort(),
        stats: {
          buildingCount: chunkBuildings.length,
          triangleCount: triangleCount(solid) + triangleCount(water),
        },
      });
    }
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** `surface.bin`: header DNSF, u8 version, u8 cellSizeM, u16 width, u16 height; mỗi ô 0 = đất, 1 = đi bộ, 2 = đường. */
export function rasterize(bounds: Box, roads: MultiPoly, pedestrian: MultiPoly[]): Uint8Array {
  const width = Math.round((bounds.maxX - bounds.minX) / SURFACE_CELL_M);
  const height = Math.round((bounds.maxZ - bounds.minZ) / SURFACE_CELL_M);
  const buf = new Uint8Array(10 + width * height);
  buf.set([0x44, 0x4e, 0x53, 0x46, 1, SURFACE_CELL_M]);
  const view = new DataView(buf.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);

  const fill = (mp: MultiPoly, value: number) => {
    for (const poly of mp) {
      const bb = ringBox(poly[0]!);
      const c0 = Math.max(0, Math.floor((bb.minX - bounds.minX) / SURFACE_CELL_M));
      const c1 = Math.min(width - 1, Math.floor((bb.maxX - bounds.minX) / SURFACE_CELL_M));
      const r0 = Math.max(0, Math.floor((bb.minZ - bounds.minZ) / SURFACE_CELL_M));
      const r1 = Math.min(height - 1, Math.floor((bb.maxZ - bounds.minZ) / SURFACE_CELL_M));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = bounds.minX + (c + 0.5) * SURFACE_CELL_M;
          const z = bounds.minZ + (r + 0.5) * SURFACE_CELL_M;
          const idx = 10 + r * width + c;
          // ưu tiên: road (2) > pedestrian (1) > ground (0)
          if (buf[idx]! < value && polyContains(x, z, poly)) buf[idx] = value;
        }
      }
    }
  };
  for (const p of pedestrian) fill(p, 1);
  fill(roads, 2);
  return buf;
}

async function writeGlb(io: NodeIO, solid: MeshBuilder, water: MeshBuilder): Promise<Uint8Array> {
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.SILENT));
  const buffer = doc.createBuffer();
  const material = doc
    .createMaterial("vertex-color")
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(1)
    .setMetallicFactor(0);
  const mesh = doc.createMesh("static");
  for (const m of [solid, water]) {
    if (m.indices.length === 0) continue;
    const accessor = (
      type: "VEC3" | "VEC4" | "SCALAR",
      array: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
      normalized = false,
    ) =>
      doc
        .createAccessor()
        .setType(type)
        .setArray(array)
        .setNormalized(normalized)
        .setBuffer(buffer);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", new Float32Array(m.positions)))
        .setAttribute("NORMAL", accessor("VEC3", new Float32Array(m.normals)))
        .setAttribute("COLOR_0", accessor("VEC4", new Uint8Array(m.colors), true))
        .setIndices(accessor("SCALAR", new Uint32Array(m.indices)))
        .setMaterial(material),
    );
  }
  const scene = doc.createScene("scene");
  if (mesh.listPrimitives().length > 0) scene.addChild(doc.createNode("static").setMesh(mesh));
  await doc.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  return io.writeBinary(doc);
}
