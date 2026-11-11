import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("mặc định cho dev: cho phép ticket dev, mở ops ở 0.0.0.0", () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      nodeEnv: "development",
      port: 2567,
      opsPort: 2568,
      roomCapacity: 30,
      allowDevTickets: true,
    });
    expect(c.opsHost).toBe("0.0.0.0");
  });

  it("production bắt buộc có secret, tắt ticket dev, ops chỉ nghe localhost", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/REALTIME_TICKET_SECRET/);
    const c = loadConfig({ NODE_ENV: "production", REALTIME_TICKET_SECRET: "k".repeat(40) });
    expect(c.allowDevTickets).toBe(false);
    expect(c.opsHost).toBe("127.0.0.1");
  });

  it("production không được bật ticket dev", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        REALTIME_TICKET_SECRET: "k".repeat(40),
        ALLOW_DEV_TICKETS: "true",
      }),
    ).toThrow(/ALLOW_DEV_TICKETS/);
  });

  it("từ chối secret quá ngắn và sức chứa sai", () => {
    expect(() => loadConfig({ REALTIME_TICKET_SECRET: "ngan" })).toThrow();
    expect(() => loadConfig({ ROOM_CAPACITY: "0" })).toThrow();
  });
});
