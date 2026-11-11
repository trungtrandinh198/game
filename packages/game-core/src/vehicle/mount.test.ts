import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, VEHICLE_DEFAULTS, VEHICLE_MOUNT_RANGE_M } from "@dnw/game-config";
import { createCollisionWorld } from "../collision/collision";
import { checkMount, findDismountPosition, nearestMountable } from "./mount";

describe("checkMount", () => {
  const vehicle = { id: "v1", x: 10, z: 0, hasDriver: false };

  it("cho phép khi đủ gần và xe trống", () => {
    expect(checkMount({ x: 10 - VEHICLE_MOUNT_RANGE_M, z: 0 }, vehicle)).toEqual({ ok: true });
  });

  it("từ chối khi quá xa, nhưng cho phép trong dung sai", () => {
    const player = { x: 10 - VEHICLE_MOUNT_RANGE_M - 0.5, z: 0 };
    expect(checkMount(player, vehicle)).toEqual({ ok: false, code: "VEHICLE_TOO_FAR" });
    expect(checkMount(player, vehicle, 1)).toEqual({ ok: true });
  });

  it("từ chối khi đã có người lái, ưu tiên báo OCCUPIED", () => {
    expect(checkMount({ x: 100, z: 100 }, { ...vehicle, hasDriver: true })).toEqual({
      ok: false,
      code: "VEHICLE_OCCUPIED",
    });
  });
});

describe("nearestMountable", () => {
  it("chọn xe trống gần nhất, bỏ qua xe có người lái", () => {
    const vehicles = [
      { id: "far", x: 2.5, z: 0, hasDriver: false },
      { id: "taken", x: 0.5, z: 0, hasDriver: true },
      { id: "near", x: 1, z: 0, hasDriver: false },
    ];
    expect(nearestMountable({ x: 0, z: 0 }, vehicles)?.id).toBe("near");
  });

  it("không có xe nào trong tầm thì trả undefined", () => {
    expect(
      nearestMountable({ x: 0, z: 0 }, [{ id: "a", x: 50, z: 0, hasDriver: false }]),
    ).toBeUndefined();
    expect(nearestMountable({ x: 0, z: 0 }, [])).toBeUndefined();
  });
});

describe("findDismountPosition", () => {
  const dims = VEHICLE_DEFAULTS.car.dimensions;
  const vehicle = { x: 0, z: 0, rotY: 0 };

  it("ưu tiên bên trái xe (với rotY = 0, trái là +X)", () => {
    const p = findDismountPosition(vehicle, dims);
    expect(p).not.toBeNull();
    expect(p!.x).toBeGreaterThan(1.2 - 1e-9);
    expect(Math.abs(p!.z)).toBeLessThan(1e-9);
  });

  it("chuyển sang bên phải khi bên trái bị chắn", () => {
    const wall = createCollisionWorld([[1.5, -10, 1.5, 10]], 8);
    const p = findDismountPosition(vehicle, dims, { collision: wall });
    expect(p).not.toBeNull();
    expect(p!.x).toBeLessThan(0);
  });

  it("dùng phía sau khi hai bên đều bị chắn", () => {
    const walls = createCollisionWorld(
      [
        [1.5, -10, 1.5, 10],
        [-1.5, -10, -1.5, 10],
      ],
      8,
    );
    const p = findDismountPosition(vehicle, dims, { collision: walls });
    expect(p).not.toBeNull();
    expect(p!.z).toBeLessThan(0);
  });

  it("trả null khi mọi vị trí đều không hợp lệ", () => {
    const p = findDismountPosition(vehicle, dims, { inBounds: () => false });
    expect(p).toBeNull();
  });

  it("vị trí chọn không chồng lên vật cản", () => {
    const wall = createCollisionWorld([[1.5, -10, 1.5, 10]], 8);
    const p = findDismountPosition(vehicle, dims, { collision: wall });
    expect(p).not.toBeNull();
    expect(Math.abs(p!.x - 1.5)).toBeGreaterThanOrEqual(PLAYER_RADIUS);
  });
});
