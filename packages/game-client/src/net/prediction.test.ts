import { RECONCILE_SMOOTH_M, RECONCILE_SNAP_M, TICK_DT, VEHICLE_DEFAULTS } from "@dnw/game-config";
import {
  stepPlayer,
  stepVehicle,
  type PlayerInput,
  type PlayerSimState,
  type VehicleSimState,
} from "@dnw/game-core";
import { describe, expect, it } from "vitest";
import { PlayerPredictor, VehiclePredictor } from "./prediction";

const start: PlayerSimState = { x: 0, z: 0, rotY: 0 };
const walk: PlayerInput = { moveX: 0, moveZ: 1, run: true, yaw: Math.PI / 2 };

/** Giả lập server: xử lý input theo từng tick, trả trạng thái và seq đã xử lý. */
function serverAfter(inputs: { seq: number; input: PlayerInput }[], upTo: number): PlayerSimState {
  let s = start;
  for (const p of inputs) {
    if (p.seq > upTo) break;
    const r = stepPlayer(s, p.input, TICK_DT, {});
    s = { x: r.x, z: r.z, rotY: r.rotY };
  }
  return s;
}

describe("PlayerPredictor", () => {
  it("dự đoán khớp server: reconcile không sai lệch, pending bị xóa theo ack", () => {
    const pred = new PlayerPredictor(start, {});
    const sent: { seq: number; input: PlayerInput }[] = [];
    for (let seq = 1; seq <= 10; seq++) {
      pred.apply(seq, walk);
      sent.push({ seq, input: walk });
    }
    const r = pred.reconcile(serverAfter(sent, 6), 6);
    expect(r.action).toBe("none");
    expect(r.error).toBeLessThan(1e-6);
    expect(pred.pending.map((p) => p.seq)).toEqual([7, 8, 9, 10]);
  });

  it("sai lệch nhỏ hơn ngưỡng thì giữ nguyên dự đoán", () => {
    const pred = new PlayerPredictor(start, {});
    for (let seq = 1; seq <= 4; seq++) pred.apply(seq, walk);
    const before = { ...pred.state };
    const server = {
      x: pred.state.x - RECONCILE_SMOOTH_M * 0.5,
      z: pred.state.z,
      rotY: pred.state.rotY,
    };
    const r = pred.reconcile(server, 4);
    expect(r.action).toBe("none");
    expect(pred.state).toEqual(before);
  });

  it("sai lệch vừa thì kéo mượt về phía server", () => {
    const pred = new PlayerPredictor(start, {});
    for (let seq = 1; seq <= 4; seq++) pred.apply(seq, walk);
    const server = { x: pred.state.x - 1, z: pred.state.z, rotY: pred.state.rotY };
    const x0 = pred.state.x;
    const r = pred.reconcile(server, 4);
    expect(r.action).toBe("smooth");
    expect(pred.state.x).toBeLessThan(x0);
    expect(pred.state.x).toBeGreaterThan(server.x);
  });

  it("sai lệch quá lớn thì đặt lại đúng vị trí server (cộng phần chưa ack)", () => {
    const pred = new PlayerPredictor(start, {});
    for (let seq = 1; seq <= 4; seq++) pred.apply(seq, walk);
    const server = { x: pred.state.x - RECONCILE_SNAP_M - 3, z: 0, rotY: 0 };
    const r = pred.reconcile(server, 2);
    expect(r.action).toBe("snap");
    let expected: PlayerSimState = server;
    for (const input of [walk, walk]) {
      const s = stepPlayer(expected, input, TICK_DT, {});
      expected = { x: s.x, z: s.z, rotY: s.rotY };
    }
    expect(pred.state.x).toBeCloseTo(expected.x);
  });

  it("render nội suy giữa hai tick và chặn alpha ngoài [0, 1]", () => {
    const pred = new PlayerPredictor(start, {});
    pred.apply(1, walk);
    const half = pred.render(0.5);
    expect(half.x).toBeCloseTo(pred.state.x / 2);
    expect(pred.render(5).x).toBeCloseTo(pred.state.x);
    expect(pred.render(-5).x).toBeCloseTo(pred.prev.x);
  });

  it("reset xóa pending và đặt lại trạng thái", () => {
    const pred = new PlayerPredictor(start, {});
    pred.apply(1, walk);
    pred.reset({ x: 5, z: 5, rotY: 1 });
    expect(pred.pending).toHaveLength(0);
    expect(pred.state.x).toBe(5);
  });

  it("giới hạn số input chờ xác nhận", () => {
    const pred = new PlayerPredictor(start, {});
    for (let seq = 1; seq <= 200; seq++) pred.apply(seq, walk);
    expect(pred.pending.length).toBeLessThanOrEqual(60);
  });
});

describe("VehiclePredictor", () => {
  const physics = VEHICLE_DEFAULTS.motorbike;
  const v0: VehicleSimState = { x: 0, z: 0, rotY: Math.PI / 2, speed: 0, steer: 0 };
  const drive = { throttle: 1, steer: 0.3, handbrake: false };

  it("khớp với server khi cùng chuỗi input", () => {
    const pred = new VehiclePredictor(v0, physics, {});
    let server = v0;
    for (let seq = 1; seq <= 20; seq++) {
      pred.apply(seq, drive);
      server = stepVehicle(server, drive, TICK_DT, physics, {}).state;
    }
    const r = pred.reconcile(server, 20);
    expect(r.action).toBe("none");
    expect(pred.pending).toHaveLength(0);
  });

  it("replay phần chưa ack và đặt lại khi lệch quá lớn", () => {
    const pred = new VehiclePredictor(v0, physics, {});
    for (let seq = 1; seq <= 10; seq++) pred.apply(seq, drive);
    const server = { ...pred.state, x: pred.state.x - 10 };
    expect(pred.reconcile(server, 10).action).toBe("snap");
    expect(pred.state.x).toBeCloseTo(server.x);
  });

  it("lệch vừa thì kéo mượt, render nội suy, reset hoạt động", () => {
    const pred = new VehiclePredictor(v0, physics, {});
    for (let seq = 1; seq <= 10; seq++) pred.apply(seq, drive);
    const server = { ...pred.state, x: pred.state.x - 1 };
    expect(pred.reconcile(server, 10).action).toBe("smooth");
    const r = pred.render(0.5);
    expect(r.x).toBeGreaterThanOrEqual(Math.min(pred.prev.x, pred.state.x) - 1e-9);
    pred.reset(v0);
    expect(pred.pending).toHaveLength(0);
    expect(pred.state.speed).toBe(0);
  });
});
