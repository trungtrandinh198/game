import { schema, t, type SchemaType } from "@colyseus/schema";

/** State đồng bộ (mục 8.6). Không chứa userId, email hay dữ liệu nội bộ. */
export const PlayerState = schema(
  {
    id: t.string().default(""),
    displayName: t.string().default(""),
    avatarCode: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    rotY: t.float32().default(0),
    /** 0 idle, 1 walk, 2 run, 3 riding */
    movementState: t.uint8().default(0),
    /** Rỗng nếu đi bộ; khi lái xe thì x/z/rotY không được cập nhật (client suy ra từ ghế xe). */
    vehicleId: t.string().default(""),
    /** Seq của input hoặc drive đã xử lý gần nhất, phục vụ reconcile phía client. */
    lastInputSeq: t.uint32().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const VehicleState = schema(
  {
    id: t.string().default(""),
    typeCode: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    /** rotY = 0 hướng +Z. */
    rotY: t.float32().default(0),
    speed: t.float32().default(0),
    steer: t.float32().default(0),
    /** sessionId người lái, rỗng nếu đang đậu. */
    driverId: t.string().default(""),
  },
  "VehicleState",
);
export type VehicleState = SchemaType<typeof VehicleState>;

export const CityState = schema(
  {
    players: t.map(PlayerState),
    vehicles: t.map(VehicleState),
    serverTick: t.uint32().default(0),
  },
  "CityState",
);
export type CityState = SchemaType<typeof CityState>;
