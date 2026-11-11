import { Client } from "@colyseus/sdk";
import {
  INTERPOLATION_DELAY_MS,
  MOVEMENT_STATE,
  TICK_DT,
  VEHICLE_DEFAULTS,
  VEHICLE_KIND_LIST,
  VEHICLE_MOUNT_RANGE_M,
  type VehicleKind,
} from "@dnw/game-config";
import { buildSandboxWorld } from "@dnw/game-core";
import { nearestMountable } from "@dnw/game-core";
import { CityState, type NoticeCode } from "@dnw/schemas";
import type { SimulationWorld } from "../world/StreamingWorld";
import { PlayerPredictor, VehiclePredictor } from "./prediction";
import { SnapshotBuffer, type Sample } from "./snapshot";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

export interface OnlineParams {
  realtimeUrl: string;
  ticket: string;
  zoneCode: string;
  protocolVersion: number;
}

export interface OnlineControls {
  moveX: number;
  moveZ: number;
  run: boolean;
  yaw: number;
  handbrake: boolean;
}

export const NO_CONTROLS: OnlineControls = {
  moveX: 0,
  moveZ: 0,
  run: false,
  yaw: 0,
  handbrake: false,
};

export interface RenderPlayer {
  id: string;
  name: string;
  avatarCode: string;
  x: number;
  z: number;
  rotY: number;
  movementState: number;
  vehicleId: string;
  local: boolean;
}

export interface RenderVehicle {
  id: string;
  kind: VehicleKind;
  driverId: string;
  state: { x: number; z: number; rotY: number; speed: number; steer: number };
  /** Quãng đường lăn của bánh (m) để quay bánh khi render. */
  roll: number;
}

export interface OnlineStats {
  rttMs: number;
  corrections: number;
  snaps: number;
  sent: number;
  lastError: number;
}

const now = () => performance.now();

function kindOf(typeCode: string): VehicleKind {
  const prefix = typeCode.split("-")[0] ?? "";
  return (VEHICLE_KIND_LIST as readonly string[]).includes(prefix)
    ? (prefix as VehicleKind)
    : "car";
}

/**
 * Phiên kết nối realtime phía client (mục 8): gửi input 20 Hz, dự đoán + reconcile cho bản thân,
 * nội suy người chơi và xe khác. Không phụ thuộc React hay three.
 */
export class OnlineSession {
  status: ConnectionStatus = "idle";
  closeCode: number | null = null;
  predictionEnabled = true;
  readonly notices: { code: NoticeCode; at: number }[] = [];
  readonly stats: OnlineStats = { rttMs: 0, corrections: 0, snaps: 0, sent: 0, lastError: 0 };
  readonly world: SimulationWorld;
  /** Tắt khi đang ở màn loading: không gửi input và bỏ qua điều khiển. */
  inputEnabled = true;

  private room: Awaited<ReturnType<Client["joinOrCreate"]>> | null = null;
  private state: CityState | null = null;
  private controls: OnlineControls = NO_CONTROLS;
  private seq = 0;
  private tickAcc = 0;
  private interactQueued = false;
  private sentActive = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private readonly playerBuffers = new Map<string, SnapshotBuffer>();
  private readonly vehicleBuffers = new Map<string, SnapshotBuffer>();
  private readonly playerViews = new Map<string, RenderPlayer>();
  private readonly vehicleViews = new Map<string, RenderVehicle>();
  private playerPred: PlayerPredictor | null = null;
  private vehiclePred: VehiclePredictor | null = null;
  private predVehicleId = "";

  constructor(world: SimulationWorld = buildSandboxWorld()) {
    this.world = world;
  }

  get sessionId(): string {
    return this.room?.sessionId ?? "";
  }

  get players(): IterableIterator<RenderPlayer> {
    return this.playerViews.values();
  }

  get vehicles(): IterableIterator<RenderVehicle> {
    return this.vehicleViews.values();
  }

  get local(): RenderPlayer | undefined {
    return this.playerViews.get(this.sessionId);
  }

  playerById(id: string): RenderPlayer | undefined {
    return this.playerViews.get(id);
  }

  vehicleById(id: string): RenderVehicle | undefined {
    return this.vehicleViews.get(id);
  }

  /** Xe mà người chơi đang lái, nếu có. */
  get ridden(): RenderVehicle | undefined {
    const id = this.local?.vehicleId;
    return id ? this.vehicleViews.get(id) : undefined;
  }

  /** Xe trống gần nhất trong tầm lên xe (cho nút "Lên xe"). */
  get mountCandidate(): RenderVehicle | undefined {
    const me = this.local;
    if (!me || me.vehicleId) return undefined;
    const items = [...this.vehicleViews.values()].map((v) => ({
      v,
      id: v.id,
      x: v.state.x,
      z: v.state.z,
      hasDriver: v.driverId !== "",
    }));
    return nearestMountable(me, items)?.v;
  }

  async connect(params: OnlineParams): Promise<void> {
    this.status = "connecting";
    this.closeCode = null;
    // Cho phép kết nối lại trên cùng đối tượng (join lại sau khi quá hạn): xoá trạng thái phiên cũ.
    this.stopPing();
    this.playerBuffers.clear();
    this.vehicleBuffers.clear();
    this.playerViews.clear();
    this.vehicleViews.clear();
    this.playerPred = null;
    this.vehiclePred = null;
    this.predVehicleId = "";
    this.seq = 0;
    this.sentActive = false;
    const client = new Client(params.realtimeUrl);
    const room = await client.joinOrCreate(
      "city",
      { ticket: params.ticket, zoneCode: params.zoneCode, protocolVersion: params.protocolVersion },
      CityState,
    );
    this.room = room;
    this.state = room.state as CityState;
    this.status = "connected";
    // Kết nối lại 0.5/1/2/4/4/4/4 giây (~20 giây, khớp RECONNECT_WINDOW_SECONDS); hết hạn thì onLeave đóng phiên.
    room.reconnection.maxRetries = 7;
    room.reconnection.delay = 500;
    room.reconnection.minDelay = 500;
    room.reconnection.maxDelay = 4000;
    room.reconnection.backoff = (attempt, delay) => Math.min(delay * 2 ** attempt, 4000);

    room.onStateChange(() => this.ingest());
    room.onMessage("notice", (m: { code: NoticeCode }) => {
      this.notices.push({ code: m.code, at: now() });
      if (this.notices.length > 20) this.notices.shift();
    });
    room.onDrop(() => {
      this.status = "reconnecting";
    });
    room.onReconnect(() => {
      this.status = "connected";
    });
    room.onLeave((code: number) => {
      this.status = "closed";
      this.closeCode = code;
      this.stopPing();
    });
    this.ingest();
    this.pingTimer = setInterval(() => room.ping((ms: number) => (this.stats.rttMs = ms)), 2000);
  }

  async disconnect(): Promise<void> {
    this.stopPing();
    await this.room?.leave();
    this.status = "closed";
  }

  setControls(controls: OnlineControls): void {
    this.controls = this.inputEnabled ? controls : NO_CONTROLS;
  }

  /** Chờ đến khi state có người chơi của mình (vị trí spawn do server chọn). */
  async waitForLocal(timeoutMs = 8000): Promise<RenderPlayer> {
    const start = now();
    while (!this.local) {
      if (this.status === "closed") throw new Error("closed");
      if (now() - start > timeoutMs) throw new Error("spawn timeout");
      await new Promise((r) => setTimeout(r, 30));
    }
    return this.local;
  }

  /** F: lên xe gần nhất hoặc xuống xe đang lái. */
  requestInteract(): void {
    this.interactQueued = true;
  }

  /** Gọi mỗi khung hình với thời gian trôi qua (giây). */
  update(dt: number): void {
    if (this.status !== "connected" || !this.room) return;
    this.tickAcc += Math.min(dt, 0.25);
    let ticks = 0;
    while (this.tickAcc >= TICK_DT && ticks < 5) {
      this.tickAcc -= TICK_DT;
      this.tick();
      ticks++;
    }
    if (ticks === 5) this.tickAcc = 0;
    this.refreshViews(dt);
  }

  // ---------- nội bộ ----------

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private tick(): void {
    const room = this.room;
    const me = this.local;
    if (!room || !me) return;

    if (this.interactQueued) {
      this.interactQueued = false;
      if (me.vehicleId) room.send("dismount", {});
      else {
        const target = this.mountCandidate;
        if (target) room.send("mount", { vehicleId: target.id });
      }
    }

    const c = this.controls;
    if (me.vehicleId) {
      const input = { throttle: c.moveZ, steer: c.moveX, handbrake: c.handbrake };
      const active = input.throttle !== 0 || input.steer !== 0 || input.handbrake;
      if (active || this.sentActive) {
        const seq = ++this.seq;
        room.send("drive", { seq, ...input });
        this.stats.sent++;
        if (this.predictionEnabled) this.vehiclePred?.apply(seq, input);
      }
      this.sentActive = active;
    } else {
      const input = { moveX: c.moveX, moveZ: c.moveZ, run: c.run, yaw: c.yaw };
      const active = input.moveX !== 0 || input.moveZ !== 0;
      if (active || this.sentActive) {
        const seq = ++this.seq;
        room.send("input", { seq, ...input });
        this.stats.sent++;
        if (this.predictionEnabled) this.playerPred?.apply(seq, input);
      }
      this.sentActive = active;
    }
  }

  /** Đọc state từ server mỗi lần patch: đẩy vào bộ đệm nội suy rồi reconcile bản thân. */
  private ingest(): void {
    const state = this.state;
    if (!state) return;
    const t = now();

    const livePlayers = new Set<string>();
    state.players.forEach((p, id) => {
      livePlayers.add(id);
      let buffer = this.playerBuffers.get(id);
      if (!buffer) {
        buffer = new SnapshotBuffer();
        this.playerBuffers.set(id, buffer);
      }
      buffer.push({ t, x: p.x, z: p.z, rotY: p.rotY, speed: 0, steer: 0 });
      const view = this.playerViews.get(id) ?? {
        id,
        name: p.displayName,
        avatarCode: p.avatarCode,
        x: p.x,
        z: p.z,
        rotY: p.rotY,
        movementState: p.movementState,
        vehicleId: p.vehicleId,
        local: id === this.sessionId,
      };
      view.name = p.displayName;
      view.avatarCode = p.avatarCode;
      view.movementState = p.movementState;
      view.vehicleId = p.vehicleId;
      this.playerViews.set(id, view);
    });
    for (const id of [...this.playerBuffers.keys()]) {
      if (!livePlayers.has(id)) {
        this.playerBuffers.delete(id);
        this.playerViews.delete(id);
      }
    }

    const liveVehicles = new Set<string>();
    state.vehicles.forEach((v, id) => {
      liveVehicles.add(id);
      let buffer = this.vehicleBuffers.get(id);
      if (!buffer) {
        buffer = new SnapshotBuffer();
        this.vehicleBuffers.set(id, buffer);
      }
      buffer.push({ t, x: v.x, z: v.z, rotY: v.rotY, speed: v.speed, steer: v.steer });
      const view = this.vehicleViews.get(id) ?? {
        id,
        kind: kindOf(v.typeCode),
        driverId: v.driverId,
        state: { x: v.x, z: v.z, rotY: v.rotY, speed: v.speed, steer: v.steer },
        roll: 0,
      };
      view.driverId = v.driverId;
      this.vehicleViews.set(id, view);
    });
    for (const id of [...this.vehicleBuffers.keys()]) {
      if (!liveVehicles.has(id)) {
        this.vehicleBuffers.delete(id);
        this.vehicleViews.delete(id);
      }
    }

    this.reconcileLocal();
  }

  private reconcileLocal(): void {
    const state = this.state;
    const me = state?.players.get(this.sessionId);
    if (!state || !me) return;

    if (me.vehicleId) {
      const server = state.vehicles.get(me.vehicleId);
      if (!server) return;
      const serverState = {
        x: server.x,
        z: server.z,
        rotY: server.rotY,
        speed: server.speed,
        steer: server.steer,
      };
      if (this.predVehicleId !== me.vehicleId || !this.vehiclePred) {
        this.vehiclePred = new VehiclePredictor(
          serverState,
          VEHICLE_DEFAULTS[kindOf(server.typeCode)],
          {
            collision: this.world.collision,
            inBounds: this.world.inBounds,
            surfaceAt: this.world.surfaceAt,
          },
        );
        this.predVehicleId = me.vehicleId;
        this.playerPred = null;
        return;
      }
      this.note(this.vehiclePred.reconcile(serverState, me.lastInputSeq));
      return;
    }

    const serverState = { x: me.x, z: me.z, rotY: me.rotY };
    if (!this.playerPred || this.predVehicleId !== "") {
      this.playerPred = new PlayerPredictor(serverState, this.world);
      this.predVehicleId = "";
      this.vehiclePred = null;
      return;
    }
    this.note(this.playerPred.reconcile(serverState, me.lastInputSeq));
  }

  private note(result: { error: number; action: string }): void {
    this.stats.lastError = result.error;
    if (result.action === "smooth") this.stats.corrections++;
    if (result.action === "snap") this.stats.snaps++;
  }

  /** Cập nhật vị trí hiển thị của mọi thực thể từ dự đoán (bản thân) hoặc nội suy (người khác). */
  private refreshViews(dt: number): void {
    const renderTime = now() - INTERPOLATION_DELAY_MS;
    const alpha = this.tickAcc / TICK_DT;
    const myId = this.sessionId;
    const me = this.local;

    for (const [id, view] of this.vehicleViews) {
      const predicted =
        this.predictionEnabled && this.vehiclePred && me?.vehicleId === id
          ? this.vehiclePred.render(alpha)
          : null;
      const s = predicted ?? this.vehicleBuffers.get(id)?.sample(renderTime) ?? null;
      if (!s) continue;
      view.state = { x: s.x, z: s.z, rotY: s.rotY, speed: s.speed, steer: s.steer };
      view.roll += s.speed * dt;
    }

    for (const [id, view] of this.playerViews) {
      view.local = id === myId;
      const predicted =
        view.local && this.predictionEnabled && this.playerPred && !view.vehicleId
          ? this.playerPred.render(alpha)
          : null;
      const s: Pick<Sample, "x" | "z" | "rotY"> | null =
        predicted ?? this.playerBuffers.get(id)?.sample(renderTime) ?? null;
      if (!s) continue;
      view.x = s.x;
      view.z = s.z;
      view.rotY = s.rotY;
      if (view.vehicleId) {
        const v = this.vehicleViews.get(view.vehicleId);
        if (v) {
          view.x = v.state.x;
          view.z = v.state.z;
          view.rotY = v.state.rotY;
        }
        view.movementState = MOVEMENT_STATE.RIDING;
      }
    }
  }

  /** Dùng cho test và HUD: khoảng cách tối đa để lên xe. */
  static readonly MOUNT_RANGE_M = VEHICLE_MOUNT_RANGE_M;
}
