import { describe, expect, it } from "vitest";
import {
  driveMessageSchema,
  inputMessageSchema,
  joinOptionsSchema,
  mountMessageSchema,
  ticketClaimsSchema,
} from "./messages";

const validInput = { seq: 1, moveX: 0.5, moveZ: 1, run: false, yaw: 1.2 };

describe("inputMessageSchema", () => {
  it("nhận input hợp lệ", () => {
    expect(inputMessageSchema.safeParse(validInput).success).toBe(true);
  });

  it("từ chối giá trị ngoài khoảng, NaN, Infinity và kiểu sai", () => {
    for (const bad of [
      { ...validInput, moveX: 100 },
      { ...validInput, moveZ: -1.01 },
      { ...validInput, moveX: NaN },
      { ...validInput, yaw: Infinity },
      { ...validInput, seq: -1 },
      { ...validInput, seq: 1.5 },
      { ...validInput, run: "yes" },
      { moveX: 0 },
      null,
    ]) {
      expect(inputMessageSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("driveMessageSchema", () => {
  it("nhận và từ chối đúng", () => {
    expect(
      driveMessageSchema.safeParse({ seq: 3, throttle: 1, steer: -1, handbrake: true }).success,
    ).toBe(true);
    expect(
      driveMessageSchema.safeParse({ seq: 3, throttle: 2, steer: 0, handbrake: false }).success,
    ).toBe(false);
  });
});

describe("mount / join / ticket", () => {
  it("mount cần vehicleId không rỗng", () => {
    expect(mountMessageSchema.safeParse({ vehicleId: "car-1" }).success).toBe(true);
    expect(mountMessageSchema.safeParse({ vehicleId: "" }).success).toBe(false);
  });

  it("join options cần ticket, zone và protocolVersion", () => {
    expect(
      joinOptionsSchema.safeParse({
        ticket: "x".repeat(20),
        zoneCode: "sandbox",
        protocolVersion: 1,
      }).success,
    ).toBe(true);
    expect(joinOptionsSchema.safeParse({ zoneCode: "sandbox", protocolVersion: 1 }).success).toBe(
      false,
    );
  });

  it("claim của ticket", () => {
    const ok = { sub: "u1", jti: "abcdefgh1234", zone: "sandbox", pv: 1, dn: "Minh" };
    expect(ticketClaimsSchema.safeParse(ok).success).toBe(true);
    expect(ticketClaimsSchema.safeParse({ ...ok, jti: "short" }).success).toBe(false);
  });
});
