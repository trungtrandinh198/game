/** Quy ước: rotY = 0 hướng +Z; vector tiến là (sin rotY, cos rotY) trên mặt phẳng XZ (mục 8.13, 16.7). */
export function forwardVector(rotY: number): { x: number; z: number } {
  return { x: Math.sin(rotY), z: Math.cos(rotY) };
}

export * from "./collision/collision";
export * from "./fixtures/sandboxWorld";
export * from "./geo/pointInPolygon";
export * from "./geo/projection";
export * from "./movement/stepPlayer";
export * from "./surface/surface";
export * from "./vehicle/mount";
export * from "./vehicle/stepVehicle";
export * from "./world";
