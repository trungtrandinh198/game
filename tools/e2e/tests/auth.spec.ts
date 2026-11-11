import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.use({ locale: "vi-VN" });

const API = process.env["E2E_API_URL"] ?? "http://localhost:4000";
const PASSWORD = "e2e correct horse battery";

function unique() {
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

async function register(page: Page, user: { email: string; name: string }) {
  await page.goto("/vi/register");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Tên hiển thị").fill(user.name);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page.getByTestId("register-sent")).toBeVisible();
}

async function verifyAndLogin(page: Page, request: APIRequestContext, user: { email: string }) {
  const link = await verificationLink(request, user.email);
  await page.goto(link);
  await expect(page.getByTestId("verify-success")).toBeVisible();
  await page.goto("/vi/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("/ chuyển tới ngôn ngữ mặc định và đổi ngôn ngữ đổi toàn bộ giao diện", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/vi$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Khám phá Đà Nẵng");
  await page.getByRole("link", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore Da Nang");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Privacy policy");
});

test("auth: đăng ký, xác minh email, đăng nhập, chọn nhân vật, tới trang play", async ({
  page,
  request,
}) => {
  const user = unique();
  await register(page, user);
  await verifyAndLogin(page, request, user);

  await expect(page).toHaveURL(/\/vi\/character$/);
  await page.getByTestId("avatar-male-01").click();
  await page.getByTestId("save-character").click();
  await expect(page).toHaveURL(/\/vi\/play$/);

  // Đổi ngôn ngữ ở trang hồ sơ đổi toàn bộ giao diện
  await page.goto("/vi/profile");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hồ sơ và cài đặt");
  await page.getByRole("link", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/profile$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profile and settings");

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/en(\/login)?$/);
  await page.goto("/en/play");
  await expect(page).toHaveURL(/\/en\/login$/);
});

test("guard: chưa đăng nhập vào play bị chuyển về đăng nhập; chưa có nhân vật bị chuyển về chọn nhân vật", async ({
  page,
  request,
}) => {
  await page.goto("/vi/play");
  await expect(page).toHaveURL(/\/vi\/login$/);

  const user = unique();
  await register(page, user);
  await verifyAndLogin(page, request, user);
  await expect(page).toHaveURL(/\/vi\/character$/);
  await page.goto("/vi/play");
  await expect(page).toHaveURL(/\/vi\/character$/);
});

test("đăng nhập sai hiện thông báo đã dịch; mật khẩu yếu bị chặn ở form", async ({ page }) => {
  await page.goto("/vi/login");
  await page.getByLabel("Email").fill("khong-co@example.com");
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Email hoặc mật khẩu không đúng")).toBeVisible();

  await page.goto("/en/register");
  await page.getByLabel("Email").fill("x@example.com");
  await page.getByLabel("Display name").fill("Someone");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Password must be 10 to 128 characters")).toBeVisible();
  await expect(page.getByText("You must accept the terms to continue")).toBeVisible();
});
