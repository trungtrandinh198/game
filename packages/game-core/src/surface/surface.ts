import type { SurfaceKind } from "@dnw/game-config";

export const SURFACE_MAGIC = "DNSF";
const HEADER_BYTES = 10;
const KIND_BY_CODE: readonly SurfaceKind[] = ["ground", "pedestrian", "road"];

export const SURFACE_CODE: Record<SurfaceKind, number> = { ground: 0, pedestrian: 1, road: 2 };

export interface SurfaceGrid {
  cellSizeM: number;
  width: number;
  height: number;
  /** width * height byte, hàng theo +Z, cột theo +X. */
  data: Uint8Array;
}

/** Header: magic "DNSF", u8 version = 1, u8 cellSizeM, u16 width, u16 height (little-endian). */
export function encodeSurfaceGrid(grid: SurfaceGrid): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + grid.data.length);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = SURFACE_MAGIC.charCodeAt(i);
  view.setUint8(4, 1);
  view.setUint8(5, grid.cellSizeM);
  view.setUint16(6, grid.width, true);
  view.setUint16(8, grid.height, true);
  out.set(grid.data, HEADER_BYTES);
  return out;
}

export function decodeSurfaceGrid(bytes: Uint8Array): SurfaceGrid {
  if (bytes.length < HEADER_BYTES) throw new Error("surface.bin quá ngắn");
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== SURFACE_MAGIC.charCodeAt(i)) throw new Error("surface.bin sai magic");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(4) !== 1) throw new Error("surface.bin phiên bản không hỗ trợ");
  const cellSizeM = view.getUint8(5);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const data = bytes.subarray(HEADER_BYTES, HEADER_BYTES + width * height);
  if (data.length !== width * height || cellSizeM === 0) throw new Error("surface.bin hỏng");
  return { cellSizeM, width, height, data };
}

/** Tra bề mặt trong một chunk; (localX, localZ) tính từ góc chunk. */
export function surfaceInGrid(grid: SurfaceGrid, localX: number, localZ: number): SurfaceKind {
  const col = Math.floor(localX / grid.cellSizeM);
  const row = Math.floor(localZ / grid.cellSizeM);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return "ground";
  return KIND_BY_CODE[grid.data[row * grid.width + col] ?? 0] ?? "ground";
}

/** Tập hợp lưới của nhiều chunk theo mã `x<gx>_z<gz>`. */
export class SurfaceMap {
  private readonly grids = new Map<string, SurfaceGrid>();

  constructor(private readonly chunkSizeM: number) {}

  set(gx: number, gz: number, grid: SurfaceGrid): void {
    this.grids.set(`${gx}_${gz}`, grid);
  }

  delete(gx: number, gz: number): void {
    this.grids.delete(`${gx}_${gz}`);
  }

  surfaceAt = (x: number, z: number): SurfaceKind => {
    const gx = Math.floor(x / this.chunkSizeM);
    const gz = Math.floor(z / this.chunkSizeM);
    const grid = this.grids.get(`${gx}_${gz}`);
    if (!grid) return "ground";
    return surfaceInGrid(grid, x - gx * this.chunkSizeM, z - gz * this.chunkSizeM);
  };
}
