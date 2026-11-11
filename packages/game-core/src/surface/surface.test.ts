import { describe, expect, it } from "vitest";
import {
  SURFACE_CODE,
  SurfaceMap,
  decodeSurfaceGrid,
  encodeSurfaceGrid,
  surfaceInGrid,
  type SurfaceGrid,
} from "./surface";

function makeGrid(): SurfaceGrid {
  // 4 x 2 ô, mỗi ô 2 m: hàng 0 = road, hàng 1 = ground rồi pedestrian ở cột 3
  const data = new Uint8Array(8).fill(SURFACE_CODE.road, 0, 4);
  data[4] = SURFACE_CODE.ground;
  data[5] = SURFACE_CODE.ground;
  data[6] = SURFACE_CODE.ground;
  data[7] = SURFACE_CODE.pedestrian;
  return { cellSizeM: 2, width: 4, height: 2, data };
}

describe("surface.bin", () => {
  it("encode rồi decode cho kết quả giống nhau", () => {
    const grid = makeGrid();
    const decoded = decodeSurfaceGrid(encodeSurfaceGrid(grid));
    expect(decoded.cellSizeM).toBe(2);
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.data)).toEqual(Array.from(grid.data));
  });

  it("từ chối dữ liệu sai magic, thiếu byte hoặc sai phiên bản", () => {
    const good = encodeSurfaceGrid(makeGrid());
    expect(() => decodeSurfaceGrid(good.subarray(0, 5))).toThrow();
    const badMagic = good.slice();
    badMagic[0] = 0;
    expect(() => decodeSurfaceGrid(badMagic)).toThrow(/magic/);
    const badVersion = good.slice();
    badVersion[4] = 9;
    expect(() => decodeSurfaceGrid(badVersion)).toThrow(/phiên bản/);
    expect(() => decodeSurfaceGrid(good.subarray(0, good.length - 1))).toThrow(/hỏng/);
  });

  it("tra đúng ô và trả ground khi ngoài lưới", () => {
    const grid = makeGrid();
    expect(surfaceInGrid(grid, 1, 1)).toBe("road");
    expect(surfaceInGrid(grid, 7, 3)).toBe("pedestrian");
    expect(surfaceInGrid(grid, 1, 3)).toBe("ground");
    expect(surfaceInGrid(grid, -1, 0)).toBe("ground");
    expect(surfaceInGrid(grid, 100, 0)).toBe("ground");
  });

  it("SurfaceMap tra theo chunk, kể cả tọa độ âm", () => {
    const map = new SurfaceMap(8);
    map.set(0, 0, makeGrid());
    map.set(-1, 0, {
      cellSizeM: 2,
      width: 4,
      height: 4,
      data: new Uint8Array(16).fill(SURFACE_CODE.pedestrian),
    });
    expect(map.surfaceAt(1, 1)).toBe("road");
    expect(map.surfaceAt(-3, 1)).toBe("pedestrian");
    expect(map.surfaceAt(50, 50)).toBe("ground");
    map.delete(0, 0);
    expect(map.surfaceAt(1, 1)).toBe("ground");
  });
});
