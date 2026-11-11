import { expect, test } from "@playwright/test";
import {
  login,
  myPosition,
  newPlayerPage,
  playersSeen,
  sessionState,
  signUpWithCharacter,
  uniqueUser,
  waitInGame,
} from "./helpers";

test.use({ locale: "vi-VN" });
test.describe.configure({ mode: "serial" });

test("game integration: hai người dùng thật vào cùng room và thấy nhau di chuyển", async ({
  browser,
  request,
}) => {
  const a = uniqueUser();
  const b = uniqueUser();
  const pageA = await newPlayerPage(browser);
  const pageB = await newPlayerPage(browser);

  await signUpWithCharacter(pageA, request, a, "male-01");
  await signUpWithCharacter(pageB, request, b, "female-01");
  await Promise.all([waitInGame(pageA), waitInGame(pageB)]);

  // Cùng room: mỗi bên thấy cả hai người chơi (có thể có thêm người khác), tên lấy từ DB.
  await expect
    .poll(async () => (await playersSeen(pageB)).map((p) => p.name))
    .toEqual(expect.arrayContaining([a.name, b.name]));
  await expect
    .poll(async () => (await playersSeen(pageA)).map((p) => p.name))
    .toEqual(expect.arrayContaining([a.name, b.name]));

  // A đi bộ: B thấy A dịch chuyển trên bản đồ thật.
  const before = (await playersSeen(pageB)).find((p) => p.name === a.name)!;
  await pageA.keyboard.down("KeyW");
  await pageA.waitForTimeout(2500);
  await pageA.keyboard.up("KeyW");
  await pageA.waitForTimeout(600);
  const after = (await playersSeen(pageB)).find((p) => p.name === a.name)!;
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1);

  // Nạp chunk động: đã nạp lưới quanh người chơi và có chunk trong bộ nhớ.
  const streamer = await pageA.evaluate(() => {
    const w = window as unknown as { __dnwOnline?: { streamer?: { loadedCount: number } } };
    return w.__dnwOnline?.streamer?.loadedCount ?? 0;
  });
  expect(streamer).toBeGreaterThanOrEqual(1);
  expect(streamer).toBeLessThanOrEqual(25);

  await pageA.context().close();
  await pageB.context().close();
});

test("game integration: đăng nhập nơi khác đóng phiên cũ với mã 4013", async ({ browser, request }) => {
  const user = uniqueUser();
  const first = await newPlayerPage(browser);
  await signUpWithCharacter(first, request, user);
  await waitInGame(first);

  const second = await newPlayerPage(browser);
  await login(second, user);
  await second.goto("/vi/play");
  await waitInGame(second);

  await expect.poll(async () => (await sessionState(first)).closeCode, { timeout: 20_000 }).toBe(4013);
  await expect(first.getByTestId("connection-lost")).toBeVisible();
  await expect(first.getByTestId("connection-lost")).toContainText("đăng nhập ở nơi khác");

  await first.context().close();
  await second.context().close();
});

test("game integration: rớt mạng thì kết nối lại; quá hạn thì báo mất kết nối và join lại được", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const user = uniqueUser();
  const page = await newPlayerPage(browser);
  await signUpWithCharacter(page, request, user);
  await waitInGame(page);
  const before = await myPosition(page);

  // 1) Rớt kết nối thoáng qua: tự kết nối lại trong cửa sổ 20 giây, vị trí giữ nguyên.
  await page.evaluate(() => {
    const w = window as unknown as {
      __dnwOnline: { session: { room: { connection: { transport: { ws: WebSocket } } } } };
    };
    w.__dnwOnline.session.room.connection.transport.ws.close();
  });
  await expect(page.getByTestId("online-banner")).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await sessionState(page)).status, { timeout: 30_000 }).toBe("connected");
  const after = await myPosition(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(2);

  // 2) Chặn mọi kết nối tới realtime: hết hạn thì báo mất kết nối; bỏ chặn rồi thử lại thì vào lại được.
  let blocked = true;
  await page.routeWebSocket(/:2567\//, (ws) => {
    if (blocked) void ws.close();
    else ws.connectToServer();
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __dnwOnline: { session: { room: { connection: { transport: { ws: WebSocket } } } } };
    };
    w.__dnwOnline.session.room.connection.transport.ws.close();
  });
  await expect(page.getByTestId("connection-lost")).toBeVisible({ timeout: 90_000 });
  blocked = false;
  await page.getByRole("button", { name: "Thử lại" }).click();
  await waitInGame(page);

  await page.context().close();
});
