import { NO_CONTROLS, OnlineSession, type OnlineControls } from "@dnw/game-client/net";
import { RUN_SPEED, VEHICLE_DEFAULTS } from "@dnw/game-config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signTicket } from "./services/ticket";
import { sleep, startTestServer, waitFor } from "./test/helpers";

let ctx: Awaited<ReturnType<typeof startTestServer>>;

beforeAll(async () => {
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.game.stop();
});

async function connect(name: string): Promise<OnlineSession> {
  const session = new OnlineSession();
  const ticket = await signTicket(ctx.config.ticketSecret, {
    userId: `online-${name}-${Math.random().toString(36).slice(2, 8)}`,
    zoneCode: "sandbox",
    protocolVersion: ctx.config.protocolVersion,
    displayName: name,
  });
  await session.connect({
    realtimeUrl: ctx.wsUrl,
    ticket,
    zoneCode: "sandbox",
    protocolVersion: ctx.config.protocolVersion,
  });
  await waitFor(() => session.local !== undefined);
  return session;
}

/** Chạy vòng lặp khung hình ~60 fps trong `ms`, cho phép đổi controls mỗi khung. */
async function frames(
  sessions: OnlineSession[],
  ms: number,
  controls?: (elapsedMs: number, session: OnlineSession) => OnlineControls,
): Promise<void> {
  const start = performance.now();
  let last = start;
  while (performance.now() - start < ms) {
    const t = performance.now();
    for (const s of sessions) {
      if (controls) s.setControls(controls(t - start, s));
      s.update((t - last) / 1000);
    }
    last = t;
    await sleep(16);
  }
}

/** Controls đi bộ về phía (x, z), dừng khi đủ gần. */
const goTo =
  (x: number, z: number, within = 1.5) =>
  (_t: number, s: OnlineSession): OnlineControls => {
    const me = s.local!;
    const dx = x - me.x;
    const dz = z - me.z;
    if (Math.hypot(dx, dz) <= within) return NO_CONTROLS;
    return { moveX: 0, moveZ: 1, run: true, yaw: Math.atan2(dx, dz), handbrake: false };
  };

describe("OnlineSession: dự đoán và nội suy", () => {
  it("đi bộ: bản thân dự đoán mượt, khớp server, không bị snap; người khác thấy nội suy", async () => {
    const a = await connect("An");
    const b = await connect("Binh");
    await waitFor(() => b.local !== undefined && [...b.players].length >= 2);

    const startX = a.local!.x;
    await frames([a, b], 2000, () => ({
      moveX: 0,
      moveZ: 1,
      run: true,
      yaw: Math.PI / 2,
      handbrake: false,
    }));
    await frames([a, b], 500);

    const aOnB = [...b.players].find((p) => p.id === a.sessionId)!;
    expect(a.local!.x - startX).toBeGreaterThan(5);
    expect(a.local!.x - startX).toBeLessThanOrEqual(RUN_SPEED * 2.6 + 0.5);
    expect(a.stats.snaps).toBe(0);
    expect(a.stats.lastError).toBeLessThan(0.8);
    expect(Math.abs(aOnB.x - a.local!.x)).toBeLessThan(1.5);
    expect(a.stats.sent).toBeGreaterThan(30);

    await a.disconnect();
    await b.disconnect();
  });

  it("tắt dự đoán vẫn hiển thị đúng nhờ nội suy từ server", async () => {
    const a = await connect("NoPred");
    a.predictionEnabled = false;
    const startX = a.local!.x;
    await frames([a], 1500, () => ({
      moveX: 0,
      moveZ: 1,
      run: false,
      yaw: Math.PI / 2,
      handbrake: false,
    }));
    await frames([a], 400);
    expect(a.local!.x - startX).toBeGreaterThan(2);
    await a.disconnect();
  });

  it("lên xe, lái, người khác thấy xe chạy, dự đoán xe khớp server, rồi xuống xe", async () => {
    const a = await connect("Lai");
    const b = await connect("Xem");
    await waitFor(() => [...a.vehicles].length > 0 && [...b.vehicles].length > 0);
    const car = [...a.vehicles].find((v) => v.id === "car-1")!;
    const carStart = { x: car.state.x, z: car.state.z };

    await frames([a, b], 8000, (_t, s) =>
      s === a ? goTo(carStart.x, carStart.z, 2)(_t, s) : NO_CONTROLS,
    );
    expect(a.mountCandidate?.id).toBe("car-1");
    a.requestInteract();
    await frames([a, b], 600);
    expect(a.ridden?.id).toBe("car-1");

    await frames([a, b], 3500, () => ({
      moveX: 0,
      moveZ: 1,
      run: false,
      yaw: 0,
      handbrake: false,
    }));
    const carOnB = [...b.vehicles].find((v) => v.id === "car-1")!;
    expect(Math.hypot(carOnB.state.x - carStart.x, carOnB.state.z - carStart.z)).toBeGreaterThan(5);
    expect(carOnB.driverId).toBe(a.sessionId);
    expect(a.stats.snaps).toBe(0);
    expect(a.ridden!.state.speed).toBeLessThanOrEqual(
      VEHICLE_DEFAULTS.car.handling.maxSpeed + 1e-3,
    );

    await frames([a, b], 4500, () => ({
      moveX: 0,
      moveZ: -1,
      run: false,
      yaw: 0,
      handbrake: true,
    }));
    expect(Math.abs(a.ridden!.state.speed)).toBeLessThan(0.6);
    a.requestInteract();
    await frames([a, b], 600);
    expect(a.ridden).toBeUndefined();
    expect(a.local!.vehicleId).toBe("");

    await a.disconnect();
    await b.disconnect();
  });

  it("mất kết nối: trạng thái chuyển sang closed khi rời room", async () => {
    const a = await connect("Roi");
    expect(a.status).toBe("connected");
    await a.disconnect();
    expect(a.status).toBe("closed");
  });
});
