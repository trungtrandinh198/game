import type { CollisionWorld } from "./collision/collision";

/** Thế giới mô phỏng dùng chung cho người chơi và xe. */
export interface SimWorld {
  collision?: CollisionWorld;
  /** Trả false nếu điểm nằm ngoài biên của zone. */
  inBounds?: (x: number, z: number) => boolean;
}
