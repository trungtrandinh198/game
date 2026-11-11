import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const API = process.env["E2E_API_URL"] ?? "http://localhost:4000";
export const PASSWORD = "e2e correct horse battery";

export interface E2eUser {
  email: string;
  name: string;
}

export function uniqueUser(): E2eUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { email: `e2e-${id}@example.com`, name: `E2e ${id}` };
}

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`${API}/dev/mailbox`, { params: { to: email } });
    const mails = ((await res.json()) as { items: { subject: string; text: string }[] }).items;
    const mail = mails.find((m) => /verif|xác minh/i.test(m.subject));
    const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
    if (url) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không thấy thư xác minh cho ${email}`);
}

export async function login(page: Page, user: E2eUser) {
  await page.goto("/vi/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

/** Đăng ký, xác minh email, đăng nhập và chọn nhân vật; kết thúc ở trang play. */
export async function signUpWithCharacter(
  page: Page,
  request: APIRequestContext,
  user: E2eUser,
  avatar = "male-01",
) {
  await page.goto("/vi/register");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Tên hiển thị").fill(user.name);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page.getByTestId("register-sent")).toBeVisible();

  await page.goto(await verificationLink(request, user.email));
  await expect(page.getByTestId("verify-success")).toBeVisible();
  await login(page, user);
  await expect(page).toHaveURL(/\/vi\/character$/);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByTestId("save-character").click();
  await expect(page).toHaveURL(/\/vi\/play$/);
}

export async function newPlayerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    locale: "vi-VN",
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
  });
  return context.newPage();
}

interface OnlineWindow {
  __dnwOnline?: {
    session: {
      status: string;
      closeCode: number | null;
      local?: { x: number; z: number; name: string };
      players: IterableIterator<{ id: string; name: string; x: number; z: number }>;
    };
    streamer?: { loadedCount: number; totalLoaded: number; totalDisposed: number };
  };
}

/** Chờ đến khi màn loading biến mất và phiên đã kết nối với người chơi của mình. */
export async function waitInGame(page: Page) {
  await expect(page.getByTestId("loading-screen")).toBeHidden({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const s = (window as unknown as OnlineWindow).__dnwOnline?.session;
    return s?.status === "connected" && s.local !== undefined;
  });
}

export async function playersSeen(page: Page): Promise<{ name: string; x: number; z: number }[]> {
  return page.evaluate(() => {
    const s = (window as unknown as OnlineWindow).__dnwOnline?.session;
    return s ? [...s.players].map((p) => ({ name: p.name, x: p.x, z: p.z })) : [];
  });
}

export async function myPosition(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const l = (window as unknown as OnlineWindow).__dnwOnline?.session.local;
    return { x: l?.x ?? NaN, z: l?.z ?? NaN };
  });
}

export async function sessionState(page: Page): Promise<{ status: string; closeCode: number | null }> {
  return page.evaluate(() => {
    const s = (window as unknown as OnlineWindow).__dnwOnline?.session;
    return { status: s?.status ?? "none", closeCode: s?.closeCode ?? null };
  });
}
