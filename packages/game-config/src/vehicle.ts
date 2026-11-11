export const VEHICLE_KIND_LIST = ["bicycle", "motorbike", "car"] as const;
export type VehicleKind = (typeof VEHICLE_KIND_LIST)[number];

export type SurfaceKind = "ground" | "pedestrian" | "road";
export type SurfaceSpeedFactor = Record<SurfaceKind, number>;

export interface VehicleHandling {
  /** m/s */
  maxSpeed: number;
  maxReverseSpeed: number;
  /** m/s² */
  acceleration: number;
  brakeDecel: number;
  /** Hệ số cản tuyến tính (1/s). */
  drag: number;
  /** m */
  wheelbase: number;
  maxSteerDeg: number;
  /** Hệ số nhân góc lái khi chạy ở maxSpeed (1 = không giảm). */
  highSpeedSteerFactor: number;
}

export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
}

export interface VehiclePhysics {
  handling: VehicleHandling;
  dimensions: VehicleDimensions;
  surfaceSpeedFactor: SurfaceSpeedFactor;
}

/** Tốc độ bám góc lái mục tiêu (1/s). */
export const VEHICLE_STEER_RESPONSE = 5;
/** Phần tốc độ mất khi đâm thẳng vào vật cản (0..1). */
export const VEHICLE_COLLISION_SPEED_LOSS = 0.4;
/** Phanh tay mạnh gấp bao nhiêu lần phanh thường. */
export const VEHICLE_HANDBRAKE_FACTOR = 1.5;

/** Giá trị khởi điểm (mục 16.3); thông số thật nằm trong content/vehicles. */
export const VEHICLE_DEFAULTS: Record<VehicleKind, VehiclePhysics> = {
  bicycle: {
    handling: {
      maxSpeed: 5.5,
      maxReverseSpeed: 1,
      acceleration: 2,
      brakeDecel: 5,
      drag: 0.3,
      wheelbase: 1.0,
      maxSteerDeg: 40,
      highSpeedSteerFactor: 0.6,
    },
    dimensions: { length: 1.8, width: 0.6, height: 1.1 },
    surfaceSpeedFactor: { road: 1, pedestrian: 1, ground: 0.7 },
  },
  motorbike: {
    handling: {
      maxSpeed: 14,
      maxReverseSpeed: 2,
      acceleration: 5,
      brakeDecel: 9,
      drag: 0.15,
      wheelbase: 1.3,
      maxSteerDeg: 32,
      highSpeedSteerFactor: 0.35,
    },
    dimensions: { length: 1.9, width: 0.7, height: 1.1 },
    surfaceSpeedFactor: { road: 1, pedestrian: 0.6, ground: 0.45 },
  },
  car: {
    handling: {
      maxSpeed: 18,
      maxReverseSpeed: 4,
      acceleration: 4,
      brakeDecel: 10,
      drag: 0.12,
      wheelbase: 2.6,
      maxSteerDeg: 30,
      highSpeedSteerFactor: 0.3,
    },
    dimensions: { length: 4.2, width: 1.8, height: 1.5 },
    surfaceSpeedFactor: { road: 1, pedestrian: 0.3, ground: 0.2 },
  },
};
