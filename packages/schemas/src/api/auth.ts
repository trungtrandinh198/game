import { z } from "zod";
import { displayNameSchema } from "../display-name";
import { localeSchema } from "../base";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(255));

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Danh sách rất ngắn các mật khẩu phổ biến; không thay thế cho kiểm tra rò rỉ đầy đủ. */
const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "password12",
  "password123",
  "passw0rd123",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou123",
  "0123456789",
  "abcdefghij",
  "1q2w3e4r5t",
  "admin12345",
  "letmein1234",
  "welcome123",
]);

export const strongPasswordSchema = passwordSchema.refine(
  (p) => !COMMON_PASSWORDS.has(p.toLowerCase()),
  {
    message: "password_too_common",
  },
);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  displayName: displayNameSchema,
  locale: localeSchema.default("vi"),
  acceptTerms: z.literal(true),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  // Không kiểm tra độ mạnh khi đăng nhập; chỉ giới hạn kích thước để chặn tải nặng.
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const tokenBodySchema = z.object({ token: z.string().min(20).max(200) });
export const emailBodySchema = z.object({ email: emailSchema });
export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: strongPasswordSchema,
});
export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: strongPasswordSchema,
});

export const currentUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  locale: localeSchema,
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  hasCharacter: z.boolean(),
  emailVerified: z.boolean(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const loginResponseSchema = z.object({ user: currentUserSchema });
export const verificationSentSchema = z.object({ status: z.literal("verification_sent") });
export const acceptedSchema = z.object({ status: z.literal("accepted") });
export const okSchema = z.object({ status: z.literal("ok") });
