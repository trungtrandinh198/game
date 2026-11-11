/** Phiên bản giao thức realtime; tăng khi đổi message/state không tương thích (mục 8.5). */
export * from "./vehicle";

export const PROTOCOL_VERSION = 1;

export const TICK_RATE_HZ = 20;
export const TICK_DT = 1 / TICK_RATE_HZ;
export const PATCH_RATE_HZ = 20;

export const DEFAULT_ROOM_CAPACITY = 30;
export const SEAT_RESERVATION_SECONDS = 15;
export const RECONNECT_WINDOW_SECONDS = 20;
export const INPUT_HOLD_MS = 250;
export const INPUT_QUEUE_MAX = 8;
export const MAX_MESSAGES_PER_SECOND = 40;
export const KICK_MESSAGES_PER_SECOND = 100;
export const MAX_PAYLOAD_BYTES = 1024;

export const WALK_SPEED = 3.0;
export const RUN_SPEED = 6.0;
export const PLAYER_RADIUS = 0.35;

export const COLLISION_CELL_SIZE_M = 8;

export const RECONCILE_SMOOTH_M = 0.25;
export const RECONCILE_SNAP_M = 2;
export const INTERPOLATION_DELAY_MS = 100;

export const MAX_VEHICLES_PER_ROOM = 40;
export const VEHICLE_MOUNT_RANGE_M = 3;
export const VEHICLE_MOUNT_TOLERANCE_M = 1;
export const VEHICLE_MOUNT_COOLDOWN_MS = 500;
export const VEHICLE_DISMOUNT_MAX_SPEED = 3;
export const VEHICLE_ABANDON_RESPAWN_S = 120;
export const VEHICLE_ABANDON_CLEAR_RADIUS_M = 20;
export const VEHICLE_SUBSTEP_MAX_M = 0.25;

export const VEHICLE_KIND_WEIGHTS = { motorbike: 0.5, bicycle: 0.25, car: 0.25 } as const;

/** Mã đóng kết nối của ứng dụng: Colyseus giữ 4000--4010, mã riêng phải từ 4011 (mục 8.11). */
export const CLOSE_CODES = {
  KICKED: 4011,
  BANNED: 4012,
  DUPLICATE_SESSION: 4013,
  PROTOCOL_MISMATCH: 4014,
  RATE_LIMITED: 4015,
  SERVER_SHUTDOWN: 4016,
} as const;

export const MOVEMENT_STATE = { IDLE: 0, WALK: 1, RUN: 2, RIDING: 3 } as const;
