import { SURFACE_HEADER_BYTES, SURFACE_MAGIC, SURFACE_VALUES } from "@dnw/schemas";

export interface SurfaceGrid {
  cellSizeM: number;
  width: number;
  height: number;
  /** Mỗi ô: 0 = đất, 1 = đi bộ, 2 = đường (hàng theo z tăng dần, cột theo x tăng dần). */
  data: Uint8Array;
}

/** Đọc `surface.bin` (mục 16.9). */
export function parseSurface(buffer: ArrayBuffer): SurfaceGrid {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== SURFACE_MAGIC) throw new Error("surface.bin: sai magic");
  if (view.getUint8(4) !== 1) throw new Error("surface.bin: phiên bản không hỗ trợ");
  const cellSizeM = view.getUint8(5);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  if (buffer.byteLength !== SURFACE_HEADER_BYTES + width * height)
    throw new Error("surface.bin: kích thước không khớp header");
  return {
    cellSizeM,
    width,
    height,
    data: new Uint8Array(buffer, SURFACE_HEADER_BYTES, width * height),
  };
}

export type SurfaceKind = keyof typeof SURFACE_VALUES;

/** Loại bề mặt tại (x, z) local của chunk có góc (minX, minZ); ngoài lưới thì coi là đất. */
export function surfaceAt(
  grid: SurfaceGrid,
  minX: number,
  minZ: number,
  x: number,
  z: number,
): SurfaceKind {
  const col = Math.floor((x - minX) / grid.cellSizeM);
  const row = Math.floor((z - minZ) / grid.cellSizeM);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return "ground";
  const v = grid.data[row * grid.width + col];
  return v === SURFACE_VALUES.road
    ? "road"
    : v === SURFACE_VALUES.pedestrian
      ? "pedestrian"
      : "ground";
}
