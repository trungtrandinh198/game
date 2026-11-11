import { Client } from "@colyseus/sdk";
import { CityState } from "@dnw/schemas";
import { createServer } from "node:net";
import { loadConfig, type RealtimeConfig } from "../config";
import { createGameServer, type GameServer, type GameServerOverrides } from "../server";
import { signTicket } from "../services/ticket";

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

export async function startTestServer(
  env: Record<string, string> = {},
  overrides: GameServerOverrides = {},
): Promise<{
  game: GameServer;
  config: RealtimeConfig;
  wsUrl: string;
  opsUrl: string;
}> {
  const realtimePort = await freePort();
  const opsPort = await freePort();
  const config = loadConfig({
    NODE_ENV: "test",
    REALTIME_PORT: String(realtimePort),
    REALTIME_OPS_PORT: String(opsPort),
    REALTIME_OPS_HOST: "127.0.0.1",
    ...env,
  });
  const game = createGameServer(config, overrides);
  await game.start();
  return {
    game,
    config,
    wsUrl: `ws://127.0.0.1:${realtimePort}`,
    opsUrl: `http://127.0.0.1:${opsPort}`,
  };
}

export async function waitFor(
  condition: () => boolean,
  timeoutMs = 4000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: quá thời gian chờ");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CityRoomHandle = Awaited<ReturnType<Client["joinOrCreate"]>>;

/** Bọc một kết nối room: đếm seq, gửi input/drive, ghi lại notice và mã đóng. */
export class TestPlayer {
  seq = 0;
  notices: string[] = [];
  closeCode: number | null = null;

  constructor(readonly room: CityRoomHandle & { state: CityState }) {
    room.onMessage("notice", (m: { code: string }) => this.notices.push(m.code));
    room.onLeave((code: number) => {
      this.closeCode = code;
    });
  }

  static async join(
    ctx: { wsUrl: string; config: RealtimeConfig },
    opts: { user?: string; name?: string; ticket?: string; pv?: number; zone?: string } = {},
  ): Promise<TestPlayer> {
    const zone = opts.zone ?? "sandbox";
    const pv = opts.pv ?? ctx.config.protocolVersion;
    const ticket =
      opts.ticket ??
      (await signTicket(ctx.config.ticketSecret, {
        userId: opts.user ?? `user-${Math.random().toString(36).slice(2, 10)}`,
        zoneCode: zone,
        protocolVersion: pv,
        ...(opts.name ? { displayName: opts.name } : {}),
      }));
    const client = new Client(ctx.wsUrl);
    const room = await client.joinOrCreate(
      "city",
      { ticket, zoneCode: zone, protocolVersion: pv },
      CityState,
    );
    const player = new TestPlayer(room as CityRoomHandle & { state: CityState });
    await waitFor(() => player.me !== undefined);
    return player;
  }

  get me() {
    return this.room.state.players.get(this.room.sessionId);
  }

  get vehicle() {
    const id = this.me?.vehicleId;
    return id ? this.room.state.vehicles.get(id) : undefined;
  }

  input(over: Partial<{ moveX: number; moveZ: number; run: boolean; yaw: number }> = {}): void {
    this.room.send("input", { seq: ++this.seq, moveX: 0, moveZ: 0, run: false, yaw: 0, ...over });
  }

  drive(over: Partial<{ throttle: number; steer: number; handbrake: boolean }> = {}): void {
    this.room.send("drive", { seq: ++this.seq, throttle: 0, steer: 0, handbrake: false, ...over });
  }

  /** Gửi input ở 20 Hz trong `ms` mili giây. */
  async hold(send: () => void, ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      send();
      await sleep(50);
    }
  }

  /** Đi bộ tới gần điểm (x, z) bằng cách hướng yaw về mục tiêu. */
  async walkTo(x: number, z: number, within = 1.5, timeoutMs = 15_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const p = this.me!;
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.hypot(dx, dz) <= within) return;
      if (Date.now() - start > timeoutMs)
        throw new Error(`walkTo quá thời gian: còn ${Math.hypot(dx, dz).toFixed(1)} m`);
      this.input({ moveZ: 1, run: true, yaw: Math.atan2(dx, dz) });
      await sleep(50);
    }
  }

  async leave(): Promise<void> {
    await this.room.leave();
  }
}

export { CityState };
