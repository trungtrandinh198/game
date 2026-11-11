import { describe, expect, it } from "vitest";
import { TicketError, UsedTickets, signTicket, verifyTicket } from "./ticket";

const secret = "s".repeat(40);
const expected = { protocolVersion: 1, zoneCode: "sandbox" };

describe("ticket", () => {
  it("ký rồi verify trả đúng claim", async () => {
    const token = await signTicket(secret, {
      userId: "u1",
      zoneCode: "sandbox",
      protocolVersion: 1,
      displayName: "An",
    });
    const claims = await verifyTicket(secret, token, expected);
    expect(claims).toMatchObject({ sub: "u1", zone: "sandbox", pv: 1, dn: "An" });
    expect(claims.jti.length).toBeGreaterThanOrEqual(8);
  });

  it("từ chối sai secret và token hỏng", async () => {
    const token = await signTicket(secret, {
      userId: "u1",
      zoneCode: "sandbox",
      protocolVersion: 1,
    });
    await expect(verifyTicket("x".repeat(40), token, expected)).rejects.toMatchObject({
      code: "INVALID_TICKET",
    });
    await expect(verifyTicket(secret, "abc", expected)).rejects.toBeInstanceOf(TicketError);
  });

  it("từ chối sai phiên bản giao thức và sai zone", async () => {
    const token = await signTicket(secret, {
      userId: "u1",
      zoneCode: "sandbox",
      protocolVersion: 1,
    });
    await expect(
      verifyTicket(secret, token, { ...expected, protocolVersion: 2 }),
    ).rejects.toMatchObject({
      code: "PROTOCOL_MISMATCH",
    });
    await expect(
      verifyTicket(secret, token, { ...expected, zoneCode: "khac" }),
    ).rejects.toMatchObject({
      code: "ZONE_MISMATCH",
    });
  });

  it("từ chối ticket hết hạn", async () => {
    const token = await signTicket(secret, {
      userId: "u1",
      zoneCode: "sandbox",
      protocolVersion: 1,
      expiresIn: Math.floor(Date.now() / 1000) - 5,
    });
    await expect(verifyTicket(secret, token, expected)).rejects.toMatchObject({
      code: "INVALID_TICKET",
    });
  });
});

describe("UsedTickets", () => {
  it("chỉ cho dùng jti một lần, và quên sau TTL", () => {
    let now = 1_000;
    const used = new UsedTickets(60_000, () => now);
    expect(used.consume("a")).toBe(true);
    expect(used.consume("a")).toBe(false);
    expect(used.consume("b")).toBe(true);
    now += 61_000;
    expect(used.consume("a")).toBe(true);
  });
});
