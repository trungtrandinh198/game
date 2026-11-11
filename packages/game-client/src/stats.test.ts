import { describe, expect, it } from "vitest";
import { StatsCollector } from "./stats";
import { QUALITY, detectQuality } from "./quality";

describe("StatsCollector", () => {
  it("rỗng thì trả 0", () => {
    expect(new StatsCollector().snapshot().fps).toBe(0);
  });

  it("tính FPS trung bình từ thời gian khung hình", () => {
    const s = new StatsCollector();
    for (let i = 0; i < 100; i++) s.push(20);
    const snap = s.snapshot();
    expect(snap.fps).toBeCloseTo(50);
    expect(snap.fpsLow5).toBeCloseTo(50);
    expect(snap.frameMs).toBeCloseTo(20);
  });

  it("FPS thấp nhất 5% phản ánh các khung chậm", () => {
    const s = new StatsCollector(100);
    for (let i = 0; i < 90; i++) s.push(10);
    for (let i = 0; i < 10; i++) s.push(100);
    const snap = s.snapshot();
    expect(snap.fpsLow5).toBeCloseTo(10);
    expect(snap.fps).toBeGreaterThan(snap.fpsLow5);
  });

  it("chỉ giữ số mẫu gần nhất, bỏ mẫu không hợp lệ và có reset", () => {
    const s = new StatsCollector(5);
    for (let i = 0; i < 20; i++) s.push(16);
    s.push(NaN);
    s.push(-1);
    expect(s.count).toBe(5);
    s.reset();
    expect(s.count).toBe(0);
  });

  it("đọc thông tin render nếu có", () => {
    const s = new StatsCollector();
    s.push(16);
    const snap = s.snapshot({
      render: { calls: 12, triangles: 3400 },
      memory: { geometries: 5, textures: 2 },
    });
    expect(snap).toMatchObject({ calls: 12, triangles: 3400, geometries: 5, textures: 2 });
  });
});

describe("quality", () => {
  it("mức thấp tắt bóng, mức cao bật khử răng cưa", () => {
    expect(QUALITY.low.shadows).toBe(false);
    expect(QUALITY.high.antialias).toBe(true);
  });

  it("không có window thì mặc định medium", () => {
    expect(detectQuality()).toBe("medium");
  });
});
