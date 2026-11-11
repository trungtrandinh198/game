import { ServerError } from "@colyseus/core";
import { CLOSE_CODES } from "@dnw/game-config";
import { buildSandboxWorld } from "@dnw/game-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PlayerDirectory, ProgressPosition } from "./services/directory";
import { MemoryPresence } from "./services/presence";
import type { ZoneProvider, ZoneRuntime } from "./services/zone";
import { TestPlayer, sleep, startTestServer, waitFor } from "./test/helpers";

const sandbox = buildSandboxWorld();
const zone: ZoneRuntime = {
  code: "han-river-core",
  mapVersion: 3,
  world: sandbox,
  playerSpawns: [{ x: 0, z: 0, rotY: 0 }],
  vehicleSpawns: [],
};

class FakeZones implements ZoneProvider {
  async get(code: string) {
    return code === zone.code ? zone : undefined;
  }
}

/** Directory giả: người dùng "banned" bị từ chối, tên lấy từ DB chứ không từ ticket. */
class FakeDirectory implements PlayerDirectory {
  progress = new Map<string, ProgressPosition>();
  opened: string[] = [];
  closed: string[] = [];
  async authorize(userId: string) {
    if (userId === "banned") throw new ServerError(CLOSE_CODES.BANNED, "ACCOUNT_SUSPENDED");
    if (userId === "nochar") throw new ServerError(412, "CHARACTER_REQUIRED");
    return { displayName: `DB-${userId}`, avatarCode: "female-01" };
  }
  async loadProgress(userId: string) {
    return this.progress.get(userId) ?? null;
  }
  async saveProgress(userId: string, _zone: string, position: ProgressPosition) {
    this.progress.set(userId, position);
  }
  async roomOpened(_zone: string, roomId: string) {
    this.opened.push(roomId);
  }
  async roomPeak() {}
  async roomClosed(roomId: string) {
    this.closed.push(roomId);
  }
  async loadLandmarks() {
    return [];
  }
  async recordDiscovery() {
    return false;
  }
}

let ctx: Awaited<ReturnType<typeof startTestServer>>;
const directory = new FakeDirectory();
const presence = new MemoryPresence();

beforeAll(async () => {
  // Không cho ticket dev tự khai tên: tên phải đến từ directory (DB).
  ctx = await startTestServer({ NODE_ENV: "production", REALTIME_TICKET_SECRET: "t".repeat(48) }, {
    zones: new FakeZones(),
    directory,
    presence,
  });
});

afterAll(async () => {
  await ctx.game.stop();
});

describe("zone thật qua ZoneProvider/Directory", () => {
  it("vào zone, tên và avatar lấy từ directory, state không lộ userId", async () => {
    const p = await TestPlayer.join(ctx, { zone: "han-river-core", user: "u-1", name: "Gia-mao" });
    expect(p.me?.displayName).toBe("DB-u-1");
    expect(p.me?.avatarCode).toBe("female-01");
    expect(Object.keys(p.me!.toJSON())).not.toContain("userId");
    expect(Object.keys(p.me!.toJSON())).not.toContain("email");
    await p.leave();
  });

  it("zone không tồn tại hoặc chưa mở thì bị từ chối", async () => {
    await expect(TestPlayer.join(ctx, { zone: "sandbox" })).rejects.toBeTruthy();
    await expect(TestPlayer.join(ctx, { zone: "khong-co" })).rejects.toBeTruthy();
  });

  it("tài khoản bị khóa hoặc chưa có nhân vật không vào được", async () => {
    await expect(TestPlayer.join(ctx, { zone: "han-river-core", user: "banned" })).rejects.toBeTruthy();
    await expect(TestPlayer.join(ctx, { zone: "han-river-core", user: "nochar" })).rejects.toBeTruthy();
  });

  it("khôi phục vị trí đã lưu hợp lệ; vị trí ngoài biên thì dùng điểm spawn", async () => {
    directory.progress.set("returning", { x: 5, z: 5 });
    const a = await TestPlayer.join(ctx, { zone: "han-river-core", user: "returning" });
    expect(a.me?.x).toBeCloseTo(5, 1);
    expect(a.me?.z).toBeCloseTo(5, 1);
    await a.leave();

    directory.progress.set("lost", { x: 1e6, z: 1e6 });
    const b = await TestPlayer.join(ctx, { zone: "han-river-core", user: "lost" });
    expect(Math.abs(b.me!.x)).toBeLessThan(5);
    await b.leave();
  });

  it("rời room thì lưu vị trí cuối", async () => {
    const p = await TestPlayer.join(ctx, { zone: "han-river-core", user: "saver" });
    await p.hold(() => p.input({ moveZ: 1, yaw: Math.PI / 2 }), 600);
    await sleep(100);
    const x = p.me!.x;
    await p.leave();
    await waitFor(() => directory.progress.has("saver"));
    expect(directory.progress.get("saver")!.x).toBeCloseTo(x, 0);
  });

  it("ghi nhận mở/đóng room", async () => {
    const p = await TestPlayer.join(ctx, { zone: "han-river-core", user: "roomlog" });
    expect(directory.opened.length).toBeGreaterThan(0);
    await p.leave();
  });

  it("đăng nhập chỗ khác đóng phiên cũ (4013) qua presence", async () => {
    const a = await TestPlayer.join(ctx, { zone: "han-river-core", user: "dup" });
    const b = await TestPlayer.join(ctx, { zone: "han-river-core", user: "dup" });
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.DUPLICATE_SESSION);
    await b.leave();
  });

  it("sự kiện kick/ban từ presence đóng kết nối với mã tương ứng", async () => {
    const a = await TestPlayer.join(ctx, { zone: "han-river-core", user: "kicked" });
    await presence.publishModeration({ type: "kick", userId: "kicked" });
    await waitFor(() => a.closeCode !== null);
    expect(a.closeCode).toBe(CLOSE_CODES.KICKED);

    const b = await TestPlayer.join(ctx, { zone: "han-river-core", user: "banme" });
    await presence.publishModeration({ type: "ban", userId: "banme" });
    await waitFor(() => b.closeCode !== null);
    expect(b.closeCode).toBe(CLOSE_CODES.BANNED);
  });
});
