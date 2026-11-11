import { ServerError } from "@colyseus/core";
import {
  avatars,
  gameRooms,
  landmarks,
  playerCharacters,
  playerDiscoveries,
  playerProgress,
  userProfiles,
  users,
  worldZones,
  type Database,
} from "@dnw/db";
import { CLOSE_CODES } from "@dnw/game-config";
import { and, eq, sql } from "drizzle-orm";

export interface PlayerIdentity {
  displayName: string;
  avatarCode: string;
}

export interface ProgressPosition {
  x: number;
  z: number;
}

/** Thông tin landmark dùng cho discover (chỉ trường cần thiết, không chứa nội dung). */
export interface LandmarkRuntime {
  code: string;
  localX: number;
  localZ: number;
  interactionRadiusM: number;
}

/** Truy cập dữ liệu người chơi và room (role `dnw_realtime`); tên/avatar/trạng thái luôn lấy từ DB. */
export interface PlayerDirectory {
  /** Ném ServerError nếu tài khoản không được vào (khóa/ban, chưa có nhân vật). */
  authorize(userId: string, zoneCode: string, hint: { displayName?: string; avatarCode?: string }): Promise<PlayerIdentity>;
  loadProgress(userId: string, zoneCode: string): Promise<ProgressPosition | null>;
  saveProgress(userId: string, zoneCode: string, position: ProgressPosition): Promise<void>;
  roomOpened(zoneCode: string, roomId: string, capacity: number): Promise<void>;
  roomPeak(roomId: string, peakPlayers: number): Promise<void>;
  roomClosed(roomId: string): Promise<void>;
  /** Danh sách landmark đã publish trong zone (cho discover). */
  loadLandmarks(zoneCode: string): Promise<LandmarkRuntime[]>;
  /** Ghi phát hiện landmark; trả true nếu là lần đầu (chưa có bản ghi). */
  recordDiscovery(userId: string, landmarkCode: string, zoneCode: string): Promise<boolean>;
}

/** Ticket dev tự khai tên/avatar; không có lưu trữ. Chỉ dùng cho zone sandbox ngoài production. */
export class DevDirectory implements PlayerDirectory {
  async authorize(userId: string, _zone: string, hint: { displayName?: string; avatarCode?: string }) {
    return { displayName: hint.displayName ?? `Player-${userId.slice(0, 6)}`, avatarCode: hint.avatarCode ?? "male-01" };
  }
  async loadProgress() {
    return null;
  }
  async saveProgress() {}
  async roomOpened() {}
  async roomPeak() {}
  async roomClosed() {}
  async loadLandmarks() {
    return [];
  }
  async recordDiscovery() {
    return false;
  }
}

export class DbDirectory implements PlayerDirectory {
  constructor(private readonly db: Database) {}

  async authorize(userId: string): Promise<PlayerIdentity> {
    const [row] = await this.db
      .select({ status: users.status, displayName: userProfiles.displayName, avatarCode: avatars.code })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(playerCharacters, eq(playerCharacters.userId, users.id))
      .leftJoin(avatars, eq(avatars.id, playerCharacters.avatarId))
      .where(eq(users.id, userId));
    if (!row) throw new ServerError(401, "UNKNOWN_USER");
    if (row.status !== "active") throw new ServerError(CLOSE_CODES.BANNED, "ACCOUNT_SUSPENDED");
    if (!row.avatarCode) throw new ServerError(412, "CHARACTER_REQUIRED");
    return { displayName: row.displayName, avatarCode: row.avatarCode };
  }

  async loadProgress(userId: string, zoneCode: string) {
    const [row] = await this.db
      .select({ x: playerProgress.lastLocalX, z: playerProgress.lastLocalZ })
      .from(playerProgress)
      .innerJoin(worldZones, eq(worldZones.id, playerProgress.lastZoneId))
      .where(and(eq(playerProgress.userId, userId), eq(worldZones.code, zoneCode)));
    return row && row.x !== null && row.z !== null ? { x: row.x, z: row.z } : null;
  }

  async saveProgress(userId: string, zoneCode: string, position: ProgressPosition) {
    const [zone] = await this.db.select({ id: worldZones.id }).from(worldZones).where(eq(worldZones.code, zoneCode));
    if (!zone) return;
    await this.db
      .insert(playerProgress)
      .values({ userId, lastZoneId: zone.id, lastLocalX: position.x, lastLocalZ: position.z })
      .onConflictDoUpdate({
        target: playerProgress.userId,
        set: { lastZoneId: zone.id, lastLocalX: position.x, lastLocalZ: position.z, updatedAt: new Date() },
      });
  }

  async roomOpened(zoneCode: string, roomId: string, capacity: number) {
    const [zone] = await this.db.select({ id: worldZones.id }).from(worldZones).where(eq(worldZones.code, zoneCode));
    if (!zone) return;
    await this.db
      .insert(gameRooms)
      .values({ zoneId: zone.id, roomCode: roomId, capacity, serverInstance: process.env["HOSTNAME"] ?? "local" })
      .onConflictDoNothing({ target: gameRooms.roomCode });
  }

  async roomPeak(roomId: string, peakPlayers: number) {
    await this.db
      .update(gameRooms)
      .set({ peakPlayers: sql`greatest(${gameRooms.peakPlayers}, ${peakPlayers})` })
      .where(eq(gameRooms.roomCode, roomId));
  }

  async roomClosed(roomId: string) {
    await this.db.update(gameRooms).set({ status: "closed", closedAt: new Date() }).where(eq(gameRooms.roomCode, roomId));
  }

  async loadLandmarks(zoneCode: string): Promise<LandmarkRuntime[]> {
    const rows = await this.db
      .select({
        code: landmarks.code,
        localX: landmarks.localX,
        localZ: landmarks.localZ,
        interactionRadiusM: landmarks.interactionRadiusM,
      })
      .from(landmarks)
      .innerJoin(worldZones, eq(worldZones.id, landmarks.zoneId))
      .where(and(eq(worldZones.code, zoneCode), eq(landmarks.status, "published"), sql`${landmarks.deletedAt} IS NULL`));
    return rows;
  }

  async recordDiscovery(userId: string, landmarkCode: string, zoneCode: string): Promise<boolean> {
    const [landmark] = await this.db
      .select({ id: landmarks.id })
      .from(landmarks)
      .innerJoin(worldZones, eq(worldZones.id, landmarks.zoneId))
      .where(
        and(
          eq(landmarks.code, landmarkCode),
          eq(worldZones.code, zoneCode),
          eq(landmarks.status, "published"),
          sql`${landmarks.deletedAt} IS NULL`,
        ),
      );
    if (!landmark) return false;
    const result = await this.db
      .insert(playerDiscoveries)
      .values({ userId, landmarkId: landmark.id })
      .onConflictDoNothing({ target: [playerDiscoveries.userId, playerDiscoveries.landmarkId] })
      .returning({ id: playerDiscoveries.id });
    return result.length > 0;
  }
}
