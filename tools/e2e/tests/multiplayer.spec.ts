import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/** Phần tối thiểu của OnlineRuntime mà e2e đọc qua window.__dnwOnline. */
interface OnlineProbe {
  input: { cameraYaw: number };
  session: {
    status: string;
    closeCode: number | null;
    sessionId: string;
    local?: { x: number; z: number; vehicleId: string; name: string };
    ridden?: { id: string; kind: string; state: { x: number; z: number; speed: number } };
    mountCandidate?: { id: string };
    players: Iterable<{ id: string; name: string; x: number; z: number; vehicleId: string }>;
    vehicles: Iterable<{
      id: string;
      driverId: string;
      state: { x: number; z: number; speed: number };
    }>;
    stats: { snaps: number; sent: number; rttMs: number };
    room: { send(type: string, payload: unknown): void } | null;
    disconnect(): Promise<void>;
  };
}

declare global {
  interface Window {
    __dnwOnline?: OnlineProbe;
  }
}

const unique = () => Math.random().toString(36).slice(2, 8);

async function openPlayer(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/dev/multiplayer?name=${name}&user=e2e-${name}-${unique()}`);
  await expect(page.getByTestId("online-status")).toHaveText("connected", { timeout: 60_000 });
  return page;
}

const sessionOf = <T, A = undefined>(
  page: Page,
  fn: (s: OnlineProbe["session"], arg: A) => T,
  arg?: A,
) =>
  page.evaluate(
    ([src, a]) => {
      const s = window.__dnwOnline?.session;
      if (!s) return undefined;
      return (
        new Function("s", "a", `return (${src as string})(s, a)`) as (
          s: unknown,
          a: unknown,
        ) => unknown
      )(s, a);
    },
    [fn.toString(), arg] as const,
  ) as Promise<T | undefined>;

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Hướng camera về phía xe rồi chạy bằng phím W (Shift) cho tới khi đủ gần để lên xe. */
async function runToVehicle(page: Page, vehicleId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  while (Date.now() < deadline) {
    const distance = await page.evaluate((id) => {
      const online = window.__dnwOnline;
      const me = online?.session.local;
      const v = online ? [...online.session.vehicles].find((x) => x.id === id) : undefined;
      if (!online || !me || !v) return null;
      const dx = v.state.x - me.x;
      const dz = v.state.z - me.z;
      online.input.cameraYaw = Math.atan2(dx, dz);
      return Math.hypot(dx, dz);
    }, vehicleId);
    if (distance !== null && distance < 2) break;
    await page.waitForTimeout(60);
  }
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
}

test.describe("multiplayer trên trình duyệt thật", () => {
  test("hai trình duyệt thấy nhau, vị trí đồng bộ, rời đi thì biến mất", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const nameA = `An${unique()}`;
    const a = await openPlayer(ctxA, nameA);
    const b = await openPlayer(ctxB, "Binh");

    await expect.poll(() => sessionOf(a, (s) => [...s.players].length)).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => sessionOf(b, (s, name) => [...s.players].some((p) => p.name === name), nameA))
      .toBe(true);
    await expect.poll(() => sessionOf(b, (s) => [...s.players].length)).toBeGreaterThanOrEqual(2);

    const startX = (await sessionOf(a, (s) => s.local?.x)) ?? 0;
    await a.bringToFront();
    await hold(a, "KeyW", 1800);

    await expect
      .poll(async () => ((await sessionOf(a, (s) => s.local?.x)) ?? 0) - startX)
      .toBeGreaterThan(3);
    // người chơi B thấy An di chuyển theo (nội suy ~100 ms sau vị trí thật)
    await expect
      .poll(
        async () =>
          (await sessionOf(
            b,
            (s, name) => [...s.players].find((p) => p.name === name)?.x,
            nameA,
          )) ?? 0,
      )
      .toBeGreaterThan(startX + 3);

    const aId = await sessionOf(a, (s) => s.sessionId);
    // Rời room có chủ đích. Mất kết nối đột ngột được giữ chỗ trong cửa sổ reconnect (kiểm thử ở T11).
    await a.evaluate(() => window.__dnwOnline?.session.disconnect());
    await expect
      .poll(() => sessionOf(b, (s, id) => [...s.players].some((p) => p.id === id), aId), {
        timeout: 20_000,
      })
      .toBe(false);
    await ctxA.close();
    await ctxB.close();
  });

  test("lên ô tô, lái, người kia thấy xe chạy, rồi xuống xe", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await openPlayer(ctxA, "Lai");
    const b = await openPlayer(ctxB, "Xem");
    await expect.poll(() => sessionOf(a, (s) => [...s.vehicles].length)).toBeGreaterThan(0);

    // Chạy tới ô tô (camera hướng về xe), rồi lên xe bằng phím F.
    await a.bringToFront();
    await runToVehicle(a, "car-1");

    await expect.poll(() => sessionOf(a, (s) => s.mountCandidate?.id)).toBe("car-1");
    await a.keyboard.press("KeyF");
    await expect.poll(() => sessionOf(a, (s) => s.ridden?.id)).toBe("car-1");

    const carBefore =
      (await sessionOf(b, (s) => [...s.vehicles].find((v) => v.id === "car-1")?.state.x)) ?? 0;
    await hold(a, "KeyW", 3000);
    await expect
      .poll(async () =>
        Math.abs(
          ((await sessionOf(b, (s) => [...s.vehicles].find((v) => v.id === "car-1")?.state.x)) ??
            0) - carBefore,
        ),
      )
      .toBeGreaterThan(3);
    await expect
      .poll(() => sessionOf(b, (s) => [...s.vehicles].find((v) => v.id === "car-1")?.driverId))
      .not.toBe("");
    expect(await sessionOf(a, (s) => s.stats.snaps)).toBe(0);

    // phanh tay rồi xuống xe
    await hold(a, "Space", 4500);
    await expect
      .poll(() => sessionOf(a, (s) => Math.abs(s.ridden?.state.speed ?? 99)))
      .toBeLessThan(0.6);
    await a.keyboard.press("KeyF");
    await expect.poll(() => sessionOf(a, (s) => s.ridden?.id ?? "")).toBe("");
    await expect
      .poll(() => sessionOf(b, (s) => [...s.vehicles].find((v) => v.id === "car-1")?.driverId))
      .toBe("");

    await ctxA.close();
    await ctxB.close();
  });

  test("client không thể tự gửi vị trí: message lạ bị từ chối và bị ngắt kết nối", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await openPlayer(ctx, "Cheat");
    const start = await sessionOf(page, (s) => ({ x: s.local?.x ?? 0, z: s.local?.z ?? 0 }));

    await page.evaluate(async () => {
      const room = window.__dnwOnline?.session.room;
      for (let i = 0; i < 15; i++) {
        room?.send("teleport", { x: 9999, z: 9999 });
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    await expect(page.getByTestId("online-status")).toHaveText("closed", { timeout: 15_000 });
    expect(await sessionOf(page, (s) => s.closeCode)).toBe(4015);
    expect(start).toBeTruthy();
    await ctx.close();
  });
});
