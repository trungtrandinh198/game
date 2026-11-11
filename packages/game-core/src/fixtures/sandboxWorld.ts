import { COLLISION_CELL_SIZE_M, type SurfaceKind, type VehicleKind } from "@dnw/game-config";
import { createCollisionWorld, type CollisionWorld, type Segment } from "../collision/collision";
import { SURFACE_CODE, SurfaceMap } from "../surface/surface";
import { createRng } from "./rng";

export const WORLD_HALF_SIZE = 250;
export const CHUNK_SIZE_M = 256;
export const SANDBOX_ZONE_CODE = "sandbox";

export interface VehicleSpawnSpec {
  id: string;
  kind: VehicleKind;
  x: number;
  z: number;
  rotY: number;
}

/** Điểm xuất hiện người chơi và xe dùng chung giữa sandbox cục bộ và server realtime (dev). */
export const SANDBOX_PLAYER_SPAWNS: readonly { x: number; z: number; rotY: number }[] = [
  { x: -20, z: 9, rotY: Math.PI / 2 },
  { x: -22, z: 11, rotY: Math.PI / 2 },
  { x: -24, z: 9, rotY: Math.PI / 2 },
  { x: -18, z: 11, rotY: Math.PI / 2 },
];

export const SANDBOX_VEHICLE_SPAWNS: readonly VehicleSpawnSpec[] = [
  { id: "bicycle-1", kind: "bicycle", x: -14, z: 3.5, rotY: Math.PI / 2 },
  { id: "motorbike-1", kind: "motorbike", x: -9, z: 0, rotY: Math.PI / 2 },
  { id: "car-1", kind: "car", x: -4, z: -3, rotY: Math.PI / 2 },
  { id: "motorbike-2", kind: "motorbike", x: 40, z: -3, rotY: -Math.PI / 2 },
  { id: "car-2", kind: "car", x: 3, z: 40, rotY: Math.PI },
];
const SURFACE_CELL_M = 2;

/** Dải đường chữ thập: |x| < 6 hoặc |z| < 6; vỉa hè rộng thêm 2 m. */
const ROAD_HALF_WIDTH = 6;
const SIDEWALK_HALF_WIDTH = 8;
const BUILDING_CLEARANCE = 10;

/** Dòng sông chạy dọc trục Z; cầu là đoạn đường |z| < 6 băng qua. */
export const WATER = { minX: 80, maxX: 120 } as const;

export interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
}

export interface SandboxWorld {
  buildings: BuildingSpec[];
  collision: CollisionWorld;
  surfaces: SurfaceMap;
  inBounds: (x: number, z: number) => boolean;
  surfaceAt: (x: number, z: number) => SurfaceKind;
  half: number;
}

const PALETTE = [0xe8d9b5, 0xd9c2a3, 0xc9d6c3, 0xe3b7a0, 0xbfc9d9, 0xf0e0c8];

export function classifySurface(x: number, z: number): SurfaceKind {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax < ROAD_HALF_WIDTH || az < ROAD_HALF_WIDTH) return "road";
  if (ax < SIDEWALK_HALF_WIDTH || az < SIDEWALK_HALF_WIDTH) return "pedestrian";
  return "ground";
}

function rectSegments(x: number, z: number, w: number, d: number): Segment[] {
  const x1 = x - w / 2;
  const x2 = x + w / 2;
  const z1 = z - d / 2;
  const z2 = z + d / 2;
  return [
    [x1, z1, x2, z1],
    [x2, z1, x2, z2],
    [x2, z2, x1, z2],
    [x1, z2, x1, z1],
  ];
}

function generateBuildings(seed: number): BuildingSpec[] {
  const rand = createRng(seed);
  const buildings: BuildingSpec[] = [];
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      const cx = -240 + i * 32 + 16;
      const cz = -240 + j * 32 + 16;
      for (const sign of [-1, 1] as const) {
        const w = 8 + rand() * 5;
        const d = 8 + rand() * 5;
        const x = cx + sign * 8 + (rand() - 0.5) * 3;
        const z = cz + sign * 8 + (rand() - 0.5) * 3;
        const h = 6 + rand() * rand() * 40;
        const color = PALETTE[Math.floor(rand() * PALETTE.length)] ?? PALETTE[0]!;

        const onRoad =
          Math.abs(x) - w / 2 < BUILDING_CLEARANCE || Math.abs(z) - d / 2 < BUILDING_CLEARANCE;
        const inWater = x + w / 2 > WATER.minX - 4 && x - w / 2 < WATER.maxX + 4;
        const outside =
          Math.abs(x) + w / 2 > WORLD_HALF_SIZE - 2 || Math.abs(z) + d / 2 > WORLD_HALF_SIZE - 2;
        if (onRoad || inWater || outside) continue;
        buildings.push({ x, z, w, d, h, color });
      }
    }
  }
  return buildings;
}

/** Cạnh sông và lan can cầu: xe và người không đi xuống nước được. */
function waterSegments(): Segment[] {
  const segs: Segment[] = [];
  const half = WORLD_HALF_SIZE;
  for (const x of [WATER.minX, WATER.maxX]) {
    segs.push([x, -half, x, -ROAD_HALF_WIDTH], [x, ROAD_HALF_WIDTH, x, half]);
  }
  for (const z of [-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH]) segs.push([WATER.minX, z, WATER.maxX, z]);
  return segs;
}

function buildSurfaces(): SurfaceMap {
  const map = new SurfaceMap(CHUNK_SIZE_M);
  const cells = CHUNK_SIZE_M / SURFACE_CELL_M;
  for (const gx of [-1, 0]) {
    for (const gz of [-1, 0]) {
      const data = new Uint8Array(cells * cells);
      for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
          const x = gx * CHUNK_SIZE_M + (col + 0.5) * SURFACE_CELL_M;
          const z = gz * CHUNK_SIZE_M + (row + 0.5) * SURFACE_CELL_M;
          data[row * cells + col] = SURFACE_CODE[classifySurface(x, z)];
        }
      }
      map.set(gx, gz, { cellSizeM: SURFACE_CELL_M, width: cells, height: cells, data });
    }
  }
  return map;
}

export function buildSandboxWorld(seed = 1337): SandboxWorld {
  const buildings = generateBuildings(seed);
  const segments: Segment[] = [
    ...buildings.flatMap((b) => rectSegments(b.x, b.z, b.w, b.d)),
    ...waterSegments(),
  ];
  const surfaces = buildSurfaces();
  const half = WORLD_HALF_SIZE;
  return {
    buildings,
    collision: createCollisionWorld(segments, COLLISION_CELL_SIZE_M),
    surfaces,
    inBounds: (x, z) => Math.abs(x) <= half && Math.abs(z) <= half,
    surfaceAt: surfaces.surfaceAt,
    half,
  };
}
