import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createProjector } from "@dnw/game-core";
import { describe, expect, it } from "vitest";
import { buildingHeight, rasterize, SURFACE_CELL_M } from "./chunks";
import { addExtrusion, newMesh } from "./mesh";
import { bufferLine, boxPoly, centroid, polyArea, simplifyRing, union, type Pt } from "./geom";
import { extractFeatures, roadWidth } from "./osm";
import { boundaryBBox, overpassQuery } from "./download";
import { FIXTURE_ORIGIN } from "../fixtures/make-mini";

const fixture = async () =>
  JSON.parse(
    await readFile(fileURLToPath(new URL("../fixtures/mini.osm.json", import.meta.url)), "utf8"),
  );

describe("extractFeatures", () => {
  it("phân loại đối tượng OSM và chuẩn hóa", async () => {
    const f = extractFeatures(await fixture(), FIXTURE_ORIGIN);
    // nhà < 1 m² bị bỏ; relation có sân trong thành một polygon có lỗ
    expect(f.buildings).toHaveLength(4);
    const courtyard = f.buildings.find((b) => b.tags["building"] === "commercial")!;
    expect(courtyard.poly).toHaveLength(2);
    expect(polyArea(courtyard.poly)).toBeCloseTo(40 * 40 - 20 * 20, 0);

    expect(f.roads.map((r) => `${r.highway}:${r.width}:${r.bridge}`).sort()).toEqual([
      "footway:2.5:false",
      "primary:12:false",
      "primary:12:true",
      "residential:6:false",
      "tertiary:9:false",
    ]);
    expect(polyArea(f.water[0]!)).toBeCloseTo(40 * 400, -2);
    expect(f.parks).toHaveLength(1);
    expect(f.trees).toHaveLength(3);
  });

  it("thứ tự tọa độ (lon, lat): nhà đầu tiên ở (-50, -50) m và đảo thứ tự thì lệch xa", async () => {
    const f = extractFeatures(await fixture(), FIXTURE_ORIGIN);
    const a = f.buildings.find((b) => b.tags["height"] === "12")!;
    const [cx, cz] = centroid(a.poly[0]!);
    expect(cx).toBeCloseTo(-50, 1);
    expect(cz).toBeCloseTo(-50, 1);

    const p = createProjector(FIXTURE_ORIGIN);
    const g = p.toGeo(-50, -50);
    expect(p.toLocal(g.lon, g.lat).x).toBeCloseTo(-50, 3);
    const swapped = p.toLocal(g.lat, g.lon);
    expect(Math.hypot(swapped.x, swapped.z)).toBeGreaterThan(1_000_000);
  });

  it("bề rộng đường: width > lanes > mặc định theo loại", () => {
    expect(roadWidth("primary", {})).toBe(12);
    expect(roadWidth("residential", {})).toBe(6);
    expect(roadWidth("footway", {})).toBe(2.5);
    expect(roadWidth("motorway", {})).toBe(14);
    expect(roadWidth("service", { lanes: "2" })).toBeCloseTo(6.4);
    expect(roadWidth("residential", { width: "7.5", lanes: "4" })).toBe(7.5);
    expect(roadWidth("primary_link", {})).toBe(12);
  });
});

describe("buildingHeight", () => {
  it("height > levels * 3.2 > mặc định theo loại, kẹp 3--200 m", () => {
    expect(buildingHeight({ building: "yes", height: "15.5", "building:levels": "9" })).toBe(15.5);
    expect(buildingHeight({ building: "yes", "building:levels": "5" })).toBeCloseTo(16);
    expect(buildingHeight({ building: "house" })).toBe(7);
    expect(buildingHeight({ building: "apartments" })).toBe(24);
    expect(buildingHeight({ building: "commercial" })).toBe(15);
    expect(buildingHeight({ building: "yes" })).toBe(9);
    expect(buildingHeight({ building: "yes", height: "0.5" })).toBe(3);
    expect(buildingHeight({ building: "yes", height: "600" })).toBe(200);
    expect(buildingHeight({ building: "yes", height: "12,5" })).toBe(12.5);
  });
});

describe("hình học", () => {
  it("bufferLine tạo dải đúng bề rộng", () => {
    const strip = bufferLine(
      [
        [0, 0],
        [100, 0],
      ],
      12,
    );
    expect(polyArea(strip[0]!)).toBeCloseTo(1200, 3);
  });

  it("bufferLine nối liền khúc ngoặt", () => {
    const l = bufferLine(
      [
        [0, 0],
        [50, 0],
        [50, 50],
      ],
      10,
    );
    expect(l).toHaveLength(1);
    expect(polyArea(l[0]!)).toBeGreaterThan(900);
  });

  it("simplifyRing bỏ điểm thẳng hàng trong ngưỡng 0.1 m", () => {
    const ring: Pt[] = [
      [0, 0],
      [5, 0.01],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    expect(simplifyRing(ring, 0.1)).toHaveLength(5);
  });

  it("union sửa vòng tự cắt (hình nơ)", () => {
    const bowtie: Pt[] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    const fixed = union([[bowtie]]);
    expect(fixed.length).toBe(2);
    for (const p of fixed) expect(polyArea(p)).toBeGreaterThan(0);
  });

  it("tường nhà có pháp tuyến hướng ra ngoài, kể cả với lỗ thì hướng vào lỗ", () => {
    for (const flip of [false, true]) {
      const outer: Pt[] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ];
      const hole: Pt[] = [
        [3, 3],
        [3, 7],
        [7, 7],
        [7, 3],
        [3, 3],
      ];
      const m = newMesh();
      addExtrusion(
        m,
        [flip ? [...outer].reverse() : outer, flip ? hole : [...hole].reverse()],
        5,
        [1, 1, 1],
        [1, 1, 1],
      );
      const wallVerts = m.positions.length / 3 - 0;
      expect(wallVerts).toBeGreaterThan(0);
      // với mỗi tam giác tường: pháp tuyến hình học cùng hướng pháp tuyến đỉnh
      for (let i = 0; i < m.indices.length; i += 3) {
        const [a, b, c] = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
        const p = (k: number) => [
          m.positions[k * 3]!,
          m.positions[k * 3 + 1]!,
          m.positions[k * 3 + 2]!,
        ];
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
        const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
        const n = [
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ];
        const vn = [m.normals[a * 3]!, m.normals[a * 3 + 1]!, m.normals[a * 3 + 2]!];
        expect(n[0]! * vn[0]! + n[1]! * vn[1]! + n[2]! * vn[2]!).toBeGreaterThan(0);
        if (vn[1] === 0) {
          // tường ngoài: pháp tuyến hướng ra xa tâm (5, 5); tường lỗ: hướng vào tâm lỗ
          const mx = (pa[0]! + pb[0]! + pc[0]!) / 3 - 5,
            mz = (pa[2]! + pb[2]! + pc[2]!) / 3 - 5;
          const dot = mx * vn[0]! + mz * vn[2]!;
          const onHole = Math.abs(mx) <= 2.01 && Math.abs(mz) <= 2.01;
          if (onHole) expect(dot).toBeLessThan(0);
          else expect(dot).toBeGreaterThan(0);
        }
      }
    }
  });

  it("rasterize: header DNSF, ô 2 m, ưu tiên road > pedestrian > ground", () => {
    const bounds = { minX: 0, minZ: 0, maxX: 256, maxZ: 256 };
    const buf = rasterize(bounds, boxPoly({ minX: 0, minZ: 0, maxX: 20, maxZ: 20 }), [
      boxPoly({ minX: 10, minZ: 10, maxX: 40, maxZ: 40 }),
    ]);
    expect(String.fromCharCode(...buf.slice(0, 4))).toBe("DNSF");
    const view = new DataView(buf.buffer);
    expect([buf[4], buf[5], view.getUint16(6, true), view.getUint16(8, true)]).toEqual([
      1,
      SURFACE_CELL_M,
      128,
      128,
    ]);
    expect(buf.length).toBe(10 + 128 * 128);
    const at = (x: number, z: number) => buf[10 + Math.floor(z / 2) * 128 + Math.floor(x / 2)];
    expect([at(5, 5), at(15, 15), at(30, 30), at(100, 100)]).toEqual([2, 2, 1, 0]);
  });
});

describe("Overpass", () => {
  it("truy vấn có bbox (south, west, north, east) và đủ các lớp dữ liệu", () => {
    const q = overpassQuery({ south: 16.05, west: 108.21, north: 16.07, east: 108.23 });
    expect(q).toContain("(16.05,108.21,16.07,108.23)");
    for (const key of [
      '"building"',
      '"highway"',
      '"natural"="water"',
      '"waterway"="riverbank"',
      '"tree"',
    ])
      expect(q).toContain(key);
  });

  it("bbox của boundary có lề ~30 m", () => {
    const b = boundaryBBox({
      type: "Polygon",
      coordinates: [
        [
          [108.22, 16.06],
          [108.23, 16.06],
          [108.23, 16.07],
          [108.22, 16.07],
          [108.22, 16.06],
        ],
      ],
    });
    expect(b.west).toBeLessThan(108.22);
    expect(108.22 - b.west).toBeCloseTo(30 / (111_320 * Math.cos((16.065 * Math.PI) / 180)), 5);
    expect(b.north).toBeGreaterThan(16.07);
  });
});
