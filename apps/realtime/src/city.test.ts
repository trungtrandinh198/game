import { CLOSE_CODES, RUN_SPEED, VEHICLE_DEFAULTS } from "@dnw/game-config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestPlayer, sleep, startTestServer, waitFor } from "./test/helpers";

let ctx: Awaited<ReturnType<typeof startTestServer>>;

beforeAll(async () => {
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.game.stop();
});

describe("tham gia và xác thực ticket", () => {
  it("vào room, state có người chơi với tên từ ticket và không lộ dữ liệu nội bộ", async () => {
    const p = await TestPlayer.join(ctx, { name: "Minh", user: "secret-user-id-123" });
    expect(p.me?.displayName).toBe("Minh");
    const json = JSON.stringify(p.me?.toJSON());
    expect(json).not.toContain("secret-user-id-123");
    expect(Object.keys(p.me!.toJSON())).not.toContain("userId");
    await p.leave();
  });

  it("từ chối ticket rác, sai chữ ký, hết hạn, sai phiên bản, sai zone", async () => {
    await expect(TestPlayer.join(ctx, { ticket: "khong-phai-jwt-hop-le" })).rejects.toBeTruthy();

    const { signTicket } = await import("./services/ticket");
    const wrongSecret = await signTicket("x".repeat(40), {
      userId: "u",
      zoneCode: "sandbox",
      protocolVersion: 1,
    });
    await expect(TestPlayer.join(ctx, { ticket: wrongSecret })).rejects.toBeTruthy();

    const expired = await signTicket(ctx.config.ticketSecret, {
      userId: "u",
      zoneCode: "sandbox",
      protocolVersion: 1,
      expiresIn: Math.floor(Date.now() / 1000) - 10,
    });
    await expect(TestPlayer.join(ctx, { ticket: expired })).rejects.toBeTruthy();

    await expect(TestPlayer.join(ctx, { pv: 99 })).rejects.toBeTruthy();
    await expect(TestPlayer.join(ctx, { zone: "khong-ton-tai" })).rejects.toBeTruthy();
  });

  it("ticket chỉ dùng được một lần", async () => {
    const { signTicket } = await import("./services/ticket");
    const ticket = await signTicket(ctx.config.ticketSecret, {
      userId: "once",
      zoneCode: "sandbox",
      protocolVersion: 1,
    });
    const first = await TestPlayer.join(ctx, { ticket });
    await expect(TestPlayer.join(ctx, { ticket })).rejects.toBeTruthy();
    await first.leave();
  });

  it("đăng nhập chỗ khác: phiên cũ bị đóng với mã DUPLICATE_SESSION", async () => {
    const a = await TestPlayer.join(ctx, { user: "dup-user" });
    const b = await TestPlayer.join(ctx, { user: "dup-user" });
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.DUPLICATE_SESSION);
    expect(b.me).toBeDefined();
    await b.leave();
  });
});

describe("đồng bộ nhiều người", () => {
  it("hai client thấy nhau, vị trí đồng bộ, rời room thì biến mất", async () => {
    const a = await TestPlayer.join(ctx, { name: "An" });
    const b = await TestPlayer.join(ctx, { name: "Binh" });
    await waitFor(
      () =>
        a.room.state.players.has(b.room.sessionId) && b.room.state.players.has(a.room.sessionId),
    );

    const aOnB = b.room.state.players.get(a.room.sessionId)!;
    expect(aOnB.displayName).toBe("An");
    const x0 = aOnB.x;
    await a.hold(() => a.input({ moveZ: 1, yaw: Math.PI / 2 }), 1000);
    await sleep(250);
    expect(aOnB.x - x0).toBeGreaterThan(2);
    expect(aOnB.rotY).toBeCloseTo(Math.PI / 2, 1);
    expect(aOnB.movementState).toBeGreaterThanOrEqual(0);

    const aId = a.room.sessionId;
    await a.leave();
    await waitFor(() => !b.room.state.players.has(aId));
    expect(b.room.state.players.has(b.room.sessionId)).toBe(true);
    await b.leave();
  });

  it("serverTick tăng đều ~20 Hz", async () => {
    const a = await TestPlayer.join(ctx);
    const t0 = a.room.state.serverTick;
    await sleep(1000);
    const ticks = a.room.state.serverTick - t0;
    expect(ticks).toBeGreaterThan(14);
    expect(ticks).toBeLessThan(26);
    await a.leave();
  });
});

describe("chống gian lận", () => {
  it("không thể vượt RUN_SPEED dù gửi dồn dập input hợp lệ", async () => {
    const a = await TestPlayer.join(ctx);
    const x0 = a.me!.x;
    const z0 = a.me!.z;
    const started = Date.now();
    // ~60 tin trong 1.5 s (40/s), vượt hơn nhiều tần suất 20 Hz bình thường
    for (let i = 0; i < 60; i++) {
      a.input({ moveZ: 1, run: true, yaw: Math.PI / 2 });
      await sleep(25);
    }
    await sleep(200);
    const elapsed = (Date.now() - started) / 1000;
    const moved = Math.hypot(a.me!.x - x0, a.me!.z - z0);
    expect(moved).toBeLessThanOrEqual(RUN_SPEED * elapsed + 0.5);
    await a.leave();
  });

  it("input ngoài khoảng (moveX = 100) bị loại, người chơi không di chuyển", async () => {
    const a = await TestPlayer.join(ctx);
    const x0 = a.me!.x;
    const z0 = a.me!.z;
    for (let i = 0; i < 5; i++) {
      a.room.send("input", { seq: i + 1, moveX: 100, moveZ: 100, run: true, yaw: 0 });
      await sleep(50);
    }
    await sleep(300);
    expect(a.me!.x).toBeCloseTo(x0, 3);
    expect(a.me!.z).toBeCloseTo(z0, 3);
    await a.leave();
  });

  it("10 message sai schema trong 10 giây thì bị đá (RATE_LIMITED)", async () => {
    const a = await TestPlayer.join(ctx);
    for (let i = 0; i < 12; i++) {
      a.room.send("input", { rubbish: true });
      await sleep(30);
    }
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.RATE_LIMITED);
  });

  it("gửi hơn 100 message/giây thì bị đá", async () => {
    const a = await TestPlayer.join(ctx);
    for (let i = 0; i < 160; i++) a.input({ moveZ: 1 });
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.RATE_LIMITED);
  });

  it("message loại lạ không có handler cũng được tính là vi phạm", async () => {
    const a = await TestPlayer.join(ctx);
    for (let i = 0; i < 12; i++) {
      a.room.send("hack-position", { x: 0, z: 0 });
      await sleep(30);
    }
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.RATE_LIMITED);
  });
});

describe("phương tiện", () => {
  it("lên xe đạp, lái, bị từ chối xuống khi còn nhanh, phanh rồi xuống; người khác thấy xe chạy", async () => {
    const a = await TestPlayer.join(ctx, { name: "Lai" });
    const b = await TestPlayer.join(ctx, { name: "Xem" });
    await waitFor(() => b.room.state.vehicles.size > 0);
    const bike = a.room.state.vehicles.get("bicycle-1")!;

    await a.walkTo(bike.x, bike.z, 2);
    a.room.send("mount", { vehicleId: "bicycle-1" });
    await waitFor(() => a.me!.vehicleId === "bicycle-1");
    expect(a.me!.movementState).toBe(3);
    expect(bike.driverId).toBe(a.room.sessionId);

    const bikeOnB = b.room.state.vehicles.get("bicycle-1")!;
    const x0 = bikeOnB.x;
    await a.hold(() => a.drive({ throttle: 1 }), 3000);
    await sleep(200);
    expect(bike.speed).toBeGreaterThan(2);
    expect(bike.speed).toBeLessThanOrEqual(VEHICLE_DEFAULTS.bicycle.handling.maxSpeed + 1e-3);
    expect(Math.abs(bikeOnB.x - x0)).toBeGreaterThan(3);
    expect(bikeOnB.driverId).toBe(a.room.sessionId);

    a.room.send("dismount", {});
    await waitFor(() => a.notices.includes("VEHICLE_TOO_FAST"));
    expect(a.me!.vehicleId).toBe("bicycle-1");

    await a.hold(() => a.drive({ throttle: -1, handbrake: true }), 2500);
    await sleep(200);
    expect(Math.abs(bike.speed)).toBeLessThan(0.5);
    await sleep(600);
    a.room.send("dismount", {});
    await waitFor(() => a.me!.vehicleId === "");
    expect(bike.driverId).toBe("");
    expect(a.me!.movementState).toBe(0);
    expect(Math.hypot(a.me!.x - bike.x, a.me!.z - bike.z)).toBeLessThan(3.5);

    await a.leave();
    await b.leave();
  });

  it("không lên được xe quá xa hoặc xe đang có người lái; không tồn tại thì báo lỗi", async () => {
    const a = await TestPlayer.join(ctx);
    const b = await TestPlayer.join(ctx);
    a.room.send("mount", { vehicleId: "car-2" });
    await waitFor(() => a.notices.includes("VEHICLE_TOO_FAR"));
    a.room.send("mount", { vehicleId: "khong-co" });
    await waitFor(() => a.notices.includes("VEHICLE_NOT_FOUND"));

    const car = a.room.state.vehicles.get("car-1")!;
    await a.walkTo(car.x, car.z, 2);
    await b.walkTo(car.x, car.z, 2);
    a.room.send("mount", { vehicleId: "car-1" });
    await waitFor(() => a.me!.vehicleId === "car-1");
    b.room.send("mount", { vehicleId: "car-1" });
    await waitFor(() => b.notices.includes("VEHICLE_OCCUPIED"));
    expect(car.driverId).toBe(a.room.sessionId);

    await a.leave();
    const carOnB = b.room.state.vehicles.get("car-1")!;
    await waitFor(() => carOnB.driverId === "");
    await b.leave();
  });

  it("tốc độ xe không vượt giới hạn dù gửi drive dồn dập; input bị bỏ qua khi đang lái", async () => {
    const a = await TestPlayer.join(ctx);
    const car = a.room.state.vehicles.get("car-1")!;
    await a.walkTo(car.x, car.z, 2);
    a.room.send("mount", { vehicleId: "car-1" });
    await waitFor(() => a.me!.vehicleId === "car-1");

    const x0 = a.me!.x;
    for (let i = 0; i < 80; i++) {
      a.drive({ throttle: 1 });
      a.input({ moveZ: 1, run: true, yaw: Math.PI });
      await sleep(30);
    }
    await sleep(200);
    expect(car.speed).toBeLessThanOrEqual(VEHICLE_DEFAULTS.car.handling.maxSpeed + 1e-3);
    expect(a.me!.x).toBeCloseTo(x0, 3);
    await a.leave();
  });

  it("drive khi đang đi bộ bị bỏ qua", async () => {
    const a = await TestPlayer.join(ctx);
    const x0 = a.me!.x;
    await a.hold(() => a.drive({ throttle: 1 }), 500);
    expect(a.me!.x).toBeCloseTo(x0, 3);
    expect(a.me!.vehicleId).toBe("");
    await a.leave();
  });
});

describe("vận hành", () => {
  it("healthz, readyz, metrics hoạt động và đếm đúng", async () => {
    expect(await (await fetch(`${ctx.opsUrl}/healthz`)).text()).toBe("ok");
    expect((await fetch(`${ctx.opsUrl}/readyz`)).status).toBe(200);

    const a = await TestPlayer.join(ctx);
    const text = await (await fetch(`${ctx.opsUrl}/metrics`)).text();
    expect(text).toContain("dnw_players");
    expect(text).toContain("dnw_tick_duration_ms_bucket");
    expect(text).toMatch(/dnw_invalid_messages_total \d+/);
    await a.leave();
  });

  it("/dev/ticket cấp ticket dùng được để vào room (chỉ ngoài production)", async () => {
    const res = await fetch(`${ctx.opsUrl}/dev/ticket?name=Dev`);
    const body = (await res.json()) as {
      ticket: string;
      zoneCode: string;
      protocolVersion: number;
    };
    const p = await TestPlayer.join(ctx, { ticket: body.ticket });
    expect(p.me?.displayName).toBe("Dev");
    await p.leave();
  });
});
