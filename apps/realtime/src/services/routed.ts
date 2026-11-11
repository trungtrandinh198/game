import { SANDBOX_ZONE_CODE } from "@dnw/game-core";
import type { LandmarkRuntime, PlayerDirectory, PlayerIdentity, ProgressPosition } from "./directory";

/** Zone sandbox dùng DevDirectory (ticket dev), mọi zone khác dùng directory thật. */
export class RoutedDirectory implements PlayerDirectory {
  constructor(
    private readonly sandbox: PlayerDirectory,
    private readonly real: PlayerDirectory,
  ) {}

  private pick(zoneCode: string) {
    return zoneCode === SANDBOX_ZONE_CODE ? this.sandbox : this.real;
  }

  authorize(userId: string, zoneCode: string, hint: { displayName?: string; avatarCode?: string }): Promise<PlayerIdentity> {
    return this.pick(zoneCode).authorize(userId, zoneCode, hint);
  }

  loadProgress(userId: string, zoneCode: string): Promise<ProgressPosition | null> {
    return this.pick(zoneCode).loadProgress(userId, zoneCode);
  }

  saveProgress(userId: string, zoneCode: string, position: ProgressPosition): Promise<void> {
    return this.pick(zoneCode).saveProgress(userId, zoneCode, position);
  }

  roomOpened(zoneCode: string, roomId: string, capacity: number): Promise<void> {
    return this.pick(zoneCode).roomOpened(zoneCode, roomId, capacity);
  }

  async roomPeak(roomId: string, peakPlayers: number): Promise<void> {
    await this.real.roomPeak(roomId, peakPlayers);
  }

  async roomClosed(roomId: string): Promise<void> {
    await this.real.roomClosed(roomId);
  }

  loadLandmarks(zoneCode: string): Promise<LandmarkRuntime[]> {
    return this.pick(zoneCode).loadLandmarks(zoneCode);
  }

  recordDiscovery(userId: string, landmarkCode: string, zoneCode: string): Promise<boolean> {
    return this.pick(zoneCode).recordDiscovery(userId, landmarkCode, zoneCode);
  }
}
