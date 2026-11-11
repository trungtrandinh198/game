import { describe, expect, it } from "vitest";
import { createProjector, toGeo, toLocal, type ZoneOrigin } from "./projection";
import { pointInMultiPolygon, pointInPolygon, type Polygon } from "./pointInPolygon";

// Gốc gần Cầu Rồng (gần đúng, mục 16.7)
const zone: ZoneOrigin = { lon: 108.2272, lat: 16.0612 };

describe("projection", () => {
  it("gốc ánh xạ về (0, 0)", () => {
    const p = toLocal(zone, zone.lon, zone.lat);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it("đi về phía Đông làm x dương", () => {
    const p = toLocal(zone, zone.lon + 0.001, zone.lat);
    expect(p.x).toBeGreaterThan(100);
    expect(p.x).toBeLessThan(120);
    // Lưới UTM lệch Bắc thật khoảng 0.8° tại Đà Nẵng (hội tụ kinh tuyến)
    expect(Math.abs(p.z)).toBeLessThan(3);
  });

  it("đi về phía Bắc làm z âm", () => {
    const p = toLocal(zone, zone.lon, zone.lat + 0.001);
    expect(p.z).toBeLessThan(-100);
    expect(p.z).toBeGreaterThan(-120);
    expect(Math.abs(p.x)).toBeLessThan(3);
  });

  it("khứ hồi sai số dưới 0.01 m", () => {
    const projector = createProjector(zone);
    for (const [x, z] of [
      [0, 0],
      [350.5, -820.25],
      [-1200, 640],
    ] as const) {
      const g = projector.toGeo(x, z);
      const back = projector.toLocal(g.lon, g.lat);
      expect(Math.hypot(back.x - x, back.z - z)).toBeLessThan(0.01);
    }
  });

  it("toGeo của hàm tiện ích khớp với projector", () => {
    const g = toGeo(zone, 100, -200);
    const back = toLocal(zone, g.lon, g.lat);
    expect(back.x).toBeCloseTo(100, 4);
    expect(back.z).toBeCloseTo(-200, 4);
  });

  it("đảo thứ tự lon/lat cho kết quả vô lý", () => {
    const wrong = toLocal(zone, zone.lat, zone.lon);
    const distance = Math.hypot(wrong.x, wrong.z);
    expect(!Number.isFinite(distance) || distance > 100_000).toBe(true);
  });
});

describe("pointInPolygon", () => {
  const square: Polygon = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  ];
  const withHole: Polygon = [
    ...square,
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ],
  ];

  it("nhận diện điểm trong và ngoài", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(5, -1, square)).toBe(false);
  });

  it("loại điểm nằm trong lỗ", () => {
    expect(pointInPolygon(5, 5, withHole)).toBe(false);
    expect(pointInPolygon(2, 2, withHole)).toBe(true);
  });

  it("đa giác rỗng không chứa điểm nào", () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
  });

  it("MultiPolygon: thuộc một trong các phần", () => {
    const far: Polygon = [
      [
        [100, 100],
        [110, 100],
        [110, 110],
        [100, 110],
      ],
    ];
    expect(pointInMultiPolygon(105, 105, [square, far])).toBe(true);
    expect(pointInMultiPolygon(50, 50, [square, far])).toBe(false);
  });
});
