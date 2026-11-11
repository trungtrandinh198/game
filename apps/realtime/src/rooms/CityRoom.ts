import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import {
  CLOSE_CODES,
  INPUT_HOLD_MS,
  INPUT_QUEUE_MAX,
  KICK_MESSAGES_PER_SECOND,
  MAX_MESSAGES_PER_SECOND,
  MAX_VEHICLES_PER_ROOM,
  MOVEMENT_STATE,
  PLAYER_RADIUS,
  RECONNECT_WINDOW_SECONDS,
  SEAT_RESERVATION_SECONDS,
  TICK_DT,
  VEHICLE_ABANDON_CLEAR_RADIUS_M,
  VEHICLE_ABANDON_RESPAWN_S,
  VEHICLE_DEFAULTS,
  VEHICLE_DISMOUNT_MAX_SPEED,
  VEHICLE_MOUNT_COOLDOWN_MS,
  VEHICLE_MOUNT_TOLERANCE_M,
  type VehicleKind,
  type VehiclePhysics,
} from "@dnw/game-config";
import {
  checkMount,
  findDismountPosition,
  resolveCircle,
  stepPlayer,
  stepVehicle,
  type VehicleSimState,
} from "@dnw/game-core";
import {
  CityState,
  PlayerState,
  VehicleState,
  discoverMessageSchema,
  driveMessageSchema,
  inputMessageSchema,
  joinOptionsSchema,
  mountMessageSchema,
  type DiscoverMessage,
  type DriveMessage,
  type InputMessage,
  type NoticeCode,
} from "@dnw/schemas";
import type { z } from "zod";
import type { RealtimeConfig } from "../config";
import type { Metrics } from "../metrics";
import type { LandmarkRuntime, PlayerDirectory } from "../services/directory";
import type { Presence } from "../services/presence";
import { RateLimiter, ViolationCounter } from "../services/rateLimit";
import { TicketError, verifyTicket } from "../services/ticket";
import type { ZoneProvider, ZoneRuntime } from "../services/zone";

/** Client đang kết nối trong tiến trình này, dùng để đóng phiên cũ/kick từ sự kiện presence và moderation. */
export interface LocalClient {
  userId: string;
  client: Client;
}

/** Phụ thuộc dùng chung của mọi room trong một tiến trình. */
export interface RoomDeps {
  config: RealtimeConfig;
  metrics: Metrics;
  zones: ZoneProvider;
  directory: PlayerDirectory;
  presence: Presence;
  /** Theo sessionId của Colyseus. */
  localClients: Map<string, LocalClient>;
}

let deps: RoomDeps | null = null;

export function setRoomDeps(next: RoomDeps): void {
  deps = next;
}

function getDeps(): RoomDeps {
  if (!deps) throw new Error("Chưa gọi setRoomDeps()");
  return deps;
}

interface AuthData {
  userId: string;
  displayName: string;
  avatarCode: string;
}

const PROGRESS_SAVE_INTERVAL_MS = 60_000;
const LANDMARK_REFRESH_INTERVAL_MS = 5 * 60_000;
/** Chênh lệch cho phép so với bán kính tương tác khi discover (mục 8.10). */
const DISCOVER_RADIUS_TOLERANCE_M = 2;

interface VehicleRuntime {
  id: string;
  kind: VehicleKind;
  physics: VehiclePhysics;
  state: VehicleState;
  sim: VehicleSimState;
  home: { x: number; z: number; rotY: number };
  driver: string;
  lastDriverLeftAt: number | null;
  drive: DriveMessage | null;
  driveQueue: DriveMessage[];
  lastDriveAt: number;
}

interface PlayerRuntime {
  client: Client;
  userId: string;
  state: PlayerState;
  sim: { x: number; z: number; rotY: number };
  inputs: InputMessage[];
  lastInput: InputMessage | null;
  lastInputAt: number;
  lastSeq: number;
  limiter: RateLimiter;
  violations: ViolationCounter;
  vehicle: VehicleRuntime | null;
  lastMountAt: number;
  closing: boolean;
}

const ZERO_INPUT = { moveX: 0, moveZ: 0, run: false, yaw: 0 } as const;

/** Room chính của thế giới: server authoritative, client chỉ gửi ý định (mục 8). */
export class CityRoom extends Room {
  state = new CityState();
  patchRate = 50;
  autoDispose = true;
  seatReservationTimeout = SEAT_RESERVATION_SECONDS;

  private readonly players = new Map<string, PlayerRuntime>();
  private readonly vehicles = new Map<string, VehicleRuntime>();
  private readonly landmarks = new Map<string, LandmarkRuntime>();
  private accumulator = 0;
  private joinCounter = 0;
  private world!: ZoneRuntime["world"];
  private zone!: ZoneRuntime;
  private peak = 0;

  messages = {
    input: this.guard(inputMessageSchema, (rt, msg: InputMessage) => this.onInput(rt, msg)),
    drive: this.guard(driveMessageSchema, (rt, msg: DriveMessage) => this.onDrive(rt, msg)),
    mount: this.guard(mountMessageSchema, (rt, msg) => this.onMount(rt, msg.vehicleId)),
    discover: this.guard(discoverMessageSchema, (rt, msg: DiscoverMessage) => this.onDiscover(rt, msg)),
    dismount: (client: Client) => {
      const rt = this.players.get(client.sessionId);
      if (rt && this.admit(rt)) this.onDismount(rt);
    },
    "*": (client: Client) => {
      const rt = this.players.get(client.sessionId);
      if (rt) this.noteInvalid(rt);
    },
  };

  async onCreate(options: unknown) {
    const { config, metrics, zones, directory } = getDeps();
    const zoneCode = (options as { zoneCode?: unknown } | undefined)?.zoneCode;
    const zone = typeof zoneCode === "string" ? await zones.get(zoneCode) : undefined;
    if (!zone) throw new ServerError(404, "ZONE_UNAVAILABLE");

    this.zone = zone;
    this.maxClients = config.roomCapacity;
    this.world = zone.world;
    this.setMetadata({ zoneCode: zone.code });

    const limit = Math.min(
      config.maxVehiclesPerRoom ?? MAX_VEHICLES_PER_ROOM,
      MAX_VEHICLES_PER_ROOM,
    );
    for (const spawn of zone.vehicleSpawns.slice(0, limit)) {
      const vehicleState = new VehicleState();
      vehicleState.id = spawn.id;
      vehicleState.typeCode = `${spawn.kind}-01`;
      vehicleState.x = spawn.x;
      vehicleState.z = spawn.z;
      vehicleState.rotY = spawn.rotY;
      this.state.vehicles.set(spawn.id, vehicleState);
      this.vehicles.set(spawn.id, {
        id: spawn.id,
        kind: spawn.kind,
        physics: VEHICLE_DEFAULTS[spawn.kind],
        state: vehicleState,
        sim: { x: spawn.x, z: spawn.z, rotY: spawn.rotY, speed: 0, steer: 0 },
        home: { x: spawn.x, z: spawn.z, rotY: spawn.rotY },
        driver: "",
        lastDriverLeftAt: null,
        drive: null,
        driveQueue: [],
        lastDriveAt: 0,
      });
    }

    metrics.rooms.inc();
    metrics.vehicles.inc(this.vehicles.size);
    this.setTimestep((deltaMs: number) => this.onTick(deltaMs), TICK_DT * 1000);
    this.clock.setInterval(() => this.saveAllProgress(), PROGRESS_SAVE_INTERVAL_MS);
    this.clock.setInterval(() => this.refreshLandmarks(), LANDMARK_REFRESH_INTERVAL_MS);
    await this.refreshLandmarks();
    await directory.roomOpened(zone.code, this.roomId, config.roomCapacity).catch(() => undefined);
  }

  onDispose() {
    const { metrics, directory } = getDeps();
    metrics.rooms.dec();
    metrics.vehicles.dec(this.vehicles.size);
    metrics.vehiclesOccupied.dec([...this.vehicles.values()].filter((v) => v.driver !== "").length);
    void directory.roomPeak(this.roomId, this.peak).catch(() => undefined);
    void directory.roomClosed(this.roomId).catch(() => undefined);
  }

  async onAuth(_client: Client, options: unknown, _context: AuthContext): Promise<AuthData> {
    const { config, presence, directory } = getDeps();
    const joinOptions = joinOptionsSchema.safeParse(options);
    if (!joinOptions.success) throw new ServerError(400, "INVALID_JOIN_OPTIONS");
    if (joinOptions.data.protocolVersion !== config.protocolVersion) {
      throw new ServerError(CLOSE_CODES.PROTOCOL_MISMATCH, "PROTOCOL_MISMATCH");
    }
    let claims;
    try {
      claims = await verifyTicket(config.ticketSecret, joinOptions.data.ticket, {
        protocolVersion: config.protocolVersion,
        zoneCode: joinOptions.data.zoneCode,
      });
    } catch (error) {
      throw new ServerError(401, error instanceof TicketError ? error.code : "INVALID_TICKET");
    }
    if (!(await presence.consumeTicket(claims.jti))) throw new ServerError(401, "TICKET_REUSED");

    // Tên, avatar và trạng thái lấy từ DB; ticket dev (zone sandbox) mới được tự khai.
    const hint = config.allowDevTickets
      ? { ...(claims.dn ? { displayName: claims.dn } : {}), ...(claims.av ? { avatarCode: claims.av } : {}) }
      : {};
    const identity = await directory.authorize(claims.sub, joinOptions.data.zoneCode, hint);
    return { userId: claims.sub, ...identity };
  }

  async onJoin(client: Client) {
    const { metrics, presence, directory, localClients } = getDeps();
    const auth = client.auth as AuthData;

    // Một phiên mỗi user: phiên cũ bị đóng với mã 4013 qua sự kiện presence (kể cả tiến trình khác).
    localClients.set(client.sessionId, { userId: auth.userId, client });
    await presence.claim(auth.userId, { roomId: this.roomId, sessionId: client.sessionId });

    const saved = await directory.loadProgress(auth.userId, this.zone.code).catch(() => null);
    const spawn = this.chooseSpawn(saved);
    const state = new PlayerState();
    state.id = client.sessionId;
    state.displayName = auth.displayName;
    state.avatarCode = auth.avatarCode;
    state.x = spawn.x;
    state.z = spawn.z;
    state.rotY = spawn.rotY;
    this.state.players.set(client.sessionId, state);

    this.players.set(client.sessionId, {
      client,
      userId: auth.userId,
      state,
      sim: { ...spawn },
      inputs: [],
      lastInput: null,
      lastInputAt: 0,
      lastSeq: -1,
      limiter: new RateLimiter(MAX_MESSAGES_PER_SECOND, KICK_MESSAGES_PER_SECOND),
      violations: new ViolationCounter(10, 10_000),
      vehicle: null,
      lastMountAt: -Infinity,
      closing: false,
    });
    metrics.players.inc();
    this.peak = Math.max(this.peak, this.players.size);
  }

  async onDrop(client: Client) {
    const rt = this.players.get(client.sessionId);
    if (!rt || rt.closing) return;
    try {
      await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
    } catch {
      this.removePlayer(client.sessionId);
    }
  }

  onReconnect() {
    getDeps().metrics.reconnects.inc();
  }

  onLeave(client: Client) {
    this.removePlayer(client.sessionId);
  }

  // ---------- nhận message ----------

  private guard<T>(schema: z.ZodType<T>, handler: (rt: PlayerRuntime, msg: T) => void) {
    return (client: Client, payload: unknown) => {
      const rt = this.players.get(client.sessionId);
      if (!rt || !this.admit(rt)) return;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        this.noteInvalid(rt);
        return;
      }
      handler(rt, parsed.data);
    };
  }

  /** Giới hạn tần suất; trả false nếu message bị bỏ hoặc client bị đá. */
  private admit(rt: PlayerRuntime): boolean {
    const verdict = rt.limiter.hit(Date.now());
    if (verdict === "kick") {
      this.kick(rt, CLOSE_CODES.RATE_LIMITED);
      return false;
    }
    if (verdict === "drop") {
      getDeps().metrics.droppedInputs.inc();
      return false;
    }
    return true;
  }

  private noteInvalid(rt: PlayerRuntime): void {
    getDeps().metrics.invalidMessages.inc();
    if (rt.violations.add(Date.now())) this.kick(rt, CLOSE_CODES.RATE_LIMITED);
  }

  private kick(rt: PlayerRuntime, code: number): void {
    if (rt.closing) return;
    rt.closing = true;
    rt.client.leave(code);
  }

  private notice(rt: PlayerRuntime, code: NoticeCode): void {
    getDeps().metrics.mountRejected.inc();
    rt.client.send("notice", { code });
  }

  private onInput(rt: PlayerRuntime, msg: InputMessage): void {
    if (rt.vehicle) return;
    if (msg.seq <= rt.lastSeq) return;
    rt.lastSeq = msg.seq;
    rt.inputs.push(msg);
    rt.lastInput = msg;
    rt.lastInputAt = Date.now();
    if (rt.inputs.length > INPUT_QUEUE_MAX) {
      rt.inputs.shift();
      getDeps().metrics.droppedInputs.inc();
    }
  }

  private onDrive(rt: PlayerRuntime, msg: DriveMessage): void {
    const vehicle = rt.vehicle;
    if (!vehicle) return;
    if (msg.seq <= rt.lastSeq) return;
    rt.lastSeq = msg.seq;
    vehicle.driveQueue.push(msg);
    vehicle.drive = msg;
    vehicle.lastDriveAt = Date.now();
    if (vehicle.driveQueue.length > INPUT_QUEUE_MAX) {
      vehicle.driveQueue.shift();
      getDeps().metrics.droppedInputs.inc();
    }
  }

  private onMount(rt: PlayerRuntime, vehicleId: string): void {
    const { metrics } = getDeps();
    if (rt.vehicle) return this.notice(rt, "NOT_ON_FOOT");
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return this.notice(rt, "VEHICLE_NOT_FOUND");
    const now = Date.now();
    if (now - rt.lastMountAt < VEHICLE_MOUNT_COOLDOWN_MS)
      return this.notice(rt, "VEHICLE_COOLDOWN");

    const result = checkMount(
      rt.sim,
      { id: vehicle.id, x: vehicle.sim.x, z: vehicle.sim.z, hasDriver: vehicle.driver !== "" },
      VEHICLE_MOUNT_TOLERANCE_M,
    );
    if (!result.ok) return this.notice(rt, result.code);

    rt.lastMountAt = now;
    rt.vehicle = vehicle;
    rt.inputs.length = 0;
    rt.lastInput = null;
    vehicle.driver = rt.client.sessionId;
    vehicle.lastDriverLeftAt = null;
    vehicle.driveQueue.length = 0;
    vehicle.drive = null;
    vehicle.state.driverId = rt.client.sessionId;
    rt.state.vehicleId = vehicle.id;
    rt.state.movementState = MOVEMENT_STATE.RIDING;
    metrics.vehiclesOccupied.inc();
  }

  private onDismount(rt: PlayerRuntime): void {
    const vehicle = rt.vehicle;
    if (!vehicle) return this.notice(rt, "NOT_DRIVING");
    if (Math.abs(vehicle.sim.speed) > VEHICLE_DISMOUNT_MAX_SPEED)
      return this.notice(rt, "VEHICLE_TOO_FAST");
    const spot = findDismountPosition(vehicle.sim, vehicle.physics.dimensions, this.world);
    if (!spot) return this.notice(rt, "VEHICLE_NO_DISMOUNT_SPACE");
    this.releaseVehicle(rt, spot);
  }

  /** Giải phóng ghế và (nếu có) đặt người chơi xuống vị trí `spot`. */
  private releaseVehicle(rt: PlayerRuntime, spot?: { x: number; z: number }): void {
    const vehicle = rt.vehicle;
    if (!vehicle) return;
    const { metrics } = getDeps();
    rt.lastMountAt = Date.now();
    rt.vehicle = null;
    vehicle.driver = "";
    vehicle.lastDriverLeftAt = Date.now();
    vehicle.driveQueue.length = 0;
    vehicle.drive = null;
    vehicle.state.driverId = "";
    metrics.vehiclesOccupied.dec();

    const at = spot ?? { x: vehicle.sim.x, z: vehicle.sim.z };
    rt.sim = { x: at.x, z: at.z, rotY: vehicle.sim.rotY };
    rt.state.x = at.x;
    rt.state.z = at.z;
    rt.state.rotY = vehicle.sim.rotY;
    rt.state.vehicleId = "";
    rt.state.movementState = MOVEMENT_STATE.IDLE;
  }

  private removePlayer(sessionId: string): void {
    const rt = this.players.get(sessionId);
    if (!rt) return;
    const { metrics, presence, directory, localClients } = getDeps();
    if (rt.vehicle) this.releaseVehicle(rt);
    void directory
      .saveProgress(rt.userId, this.zone.code, { x: rt.sim.x, z: rt.sim.z })
      .catch(() => undefined);
    this.players.delete(sessionId);
    this.state.players.delete(sessionId);
    metrics.players.dec();
    localClients.delete(sessionId);
    void presence.release(rt.userId, sessionId).catch(() => undefined);
  }

  /** Lưu vị trí mỗi 60 giây (chỉ zone và x, z; không lưu mỗi tick). */
  private saveAllProgress(): void {
    const { directory } = getDeps();
    for (const rt of this.players.values()) {
      void directory
        .saveProgress(rt.userId, this.zone.code, { x: rt.sim.x, z: rt.sim.z })
        .catch(() => undefined);
    }
  }

  /** Nạp lại danh sách landmark đã publish của zone (mỗi 5 phút, mục 8.10). */
  private async refreshLandmarks(): Promise<void> {
    const { directory } = getDeps();
    try {
      const rows = await directory.loadLandmarks(this.zone.code);
      this.landmarks.clear();
      for (const row of rows) this.landmarks.set(row.code, row);
    } catch {
      // Giữ danh sách cũ nếu DB lỗi; discover sẽ từ chối nếu không có landmark.
    }
  }

  /** Khám phá landmark: phải trong bán kính tương tác + 2 m (dùng vị trí xe nếu đang lái). */
  private onDiscover(rt: PlayerRuntime, msg: DiscoverMessage): void {
    const landmark = this.landmarks.get(msg.landmarkCode);
    if (!landmark) return;
    const at = rt.vehicle ? { x: rt.vehicle.sim.x, z: rt.vehicle.sim.z } : rt.sim;
    const dist = Math.hypot(at.x - landmark.localX, at.z - landmark.localZ);
    if (dist > landmark.interactionRadiusM + DISCOVER_RADIUS_TOLERANCE_M) return;
    const { directory } = getDeps();
    void directory
      .recordDiscovery(rt.userId, msg.landmarkCode, this.zone.code)
      .then((discovered) => {
        if (!rt.closing) rt.client.send("discovered", { landmarkCode: msg.landmarkCode, discovered });
      })
      .catch(() => undefined);
  }

  /** Khôi phục vị trí cũ nếu hợp lệ (trong biên, không trong vật cản), không thì chọn điểm spawn lệch ≤ 1 m (mục 8.10). */
  private chooseSpawn(saved: { x: number; z: number } | null): { x: number; z: number; rotY: number } {
    const free = (x: number, z: number) =>
      this.world.inBounds(x, z) && !resolveCircle(this.world.collision, x, z, PLAYER_RADIUS).hit;
    if (saved && free(saved.x, saved.z)) return { x: saved.x, z: saved.z, rotY: 0 };
    return this.pickSpawn(free);
  }

  /** Ưu tiên điểm ít người nhất; lệch ngẫu nhiên xác định ≤ 1 m, thử nhiều lần rồi quay về điểm gốc. */
  private pickSpawn(free: (x: number, z: number) => boolean): { x: number; z: number; rotY: number } {
    const index = this.joinCounter++;
    const spawns = this.zone.playerSpawns;
    const occupancy = (s: { x: number; z: number }) =>
      [...this.players.values()].filter((p) => Math.hypot(p.sim.x - s.x, p.sim.z - s.z) < 10).length;
    const ranked = [...spawns].sort((a, b) => occupancy(a) - occupancy(b));
    const base = ranked[index % Math.max(1, Math.min(ranked.length, 3))] ?? { x: 0, z: 0, rotY: 0 };
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = (((index * 37 + attempt * 101) % 360) * Math.PI) / 180;
      const radius = attempt === 0 ? 0 : 1 - attempt / 16;
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      if (free(x, z)) return { x, z, rotY: base.rotY };
    }
    return base;
  }

  // ---------- mô phỏng ----------

  private onTick(deltaMs: number): void {
    const started = performance.now();
    this.accumulator += Math.min(deltaMs, 250) / 1000;
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < 3) {
      this.simulate();
      this.accumulator -= TICK_DT;
      steps++;
    }
    if (steps === 3) this.accumulator = 0;
    getDeps().metrics.tickDuration.observe(performance.now() - started);
  }

  private simulate(): void {
    const now = Date.now();
    const env = {
      collision: this.world.collision,
      inBounds: this.world.inBounds,
      surfaceAt: this.world.surfaceAt,
    };

    for (const rt of this.players.values()) {
      if (rt.vehicle) this.driveStep(rt, rt.vehicle, now, env);
      else this.walkStep(rt, now);
    }

    for (const vehicle of this.vehicles.values()) {
      if (vehicle.driver === "" && vehicle.sim.speed !== 0) {
        this.applyVehicle(vehicle, { throttle: 0, steer: 0, handbrake: true }, env);
      }
      this.maybeRespawn(vehicle, now);
    }
    this.state.serverTick++;
  }

  private walkStep(rt: PlayerRuntime, now: number): void {
    let input: Omit<InputMessage, "seq"> = ZERO_INPUT;
    const next = rt.inputs.shift();
    if (next) {
      input = next;
      rt.state.lastInputSeq = next.seq;
    } else if (rt.lastInput && now - rt.lastInputAt <= INPUT_HOLD_MS) {
      input = rt.lastInput;
    }
    const result = stepPlayer(rt.sim, input, TICK_DT, this.world);
    rt.sim = { x: result.x, z: result.z, rotY: result.rotY };
    rt.state.x = result.x;
    rt.state.z = result.z;
    rt.state.rotY = result.rotY;
    rt.state.movementState = result.movementState;
  }

  private driveStep(
    rt: PlayerRuntime,
    vehicle: VehicleRuntime,
    now: number,
    env: Parameters<typeof stepVehicle>[4],
  ): void {
    let input = { throttle: 0, steer: 0, handbrake: false };
    const next = vehicle.driveQueue.shift();
    if (next) {
      input = next;
      rt.state.lastInputSeq = next.seq;
    } else if (vehicle.drive && now - vehicle.lastDriveAt <= INPUT_HOLD_MS) {
      input = vehicle.drive;
    } else if (vehicle.sim.speed > 0.5) {
      input = { throttle: -0.3, steer: 0, handbrake: false };
    }
    this.applyVehicle(vehicle, input, env);
  }

  private applyVehicle(
    vehicle: VehicleRuntime,
    input: { throttle: number; steer: number; handbrake: boolean },
    env: Parameters<typeof stepVehicle>[4],
  ): void {
    const result = stepVehicle(vehicle.sim, input, TICK_DT, vehicle.physics, env);
    vehicle.sim = result.state;
    if (result.collided) getDeps().metrics.vehicleCollisions.inc();
    vehicle.state.x = result.state.x;
    vehicle.state.z = result.state.z;
    vehicle.state.rotY = result.state.rotY;
    vehicle.state.speed = result.state.speed;
    vehicle.state.steer = result.state.steer;
  }

  /** Xe bị bỏ lâu mà không ai ở gần thì quay về điểm đậu gốc (mục 3.6). */
  private maybeRespawn(vehicle: VehicleRuntime, now: number): void {
    if (vehicle.driver !== "" || vehicle.lastDriverLeftAt === null) return;
    if (now - vehicle.lastDriverLeftAt < VEHICLE_ABANDON_RESPAWN_S * 1000) return;
    for (const rt of this.players.values()) {
      if (
        Math.hypot(rt.sim.x - vehicle.sim.x, rt.sim.z - vehicle.sim.z) <=
        VEHICLE_ABANDON_CLEAR_RADIUS_M
      )
        return;
    }
    vehicle.sim = { ...vehicle.home, speed: 0, steer: 0 };
    vehicle.state.x = vehicle.home.x;
    vehicle.state.z = vehicle.home.z;
    vehicle.state.rotY = vehicle.home.rotY;
    vehicle.state.speed = 0;
    vehicle.state.steer = 0;
    vehicle.lastDriverLeftAt = null;
  }
}
