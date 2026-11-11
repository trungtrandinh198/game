import { z } from "zod";
import {
  displayNameSchema,
  emailSchema,
  PASSWORD_MAX,
  PASSWORD_MIN,
  strongPasswordSchema,
} from "@dnw/schemas";

/**
 * Schema form dùng chung với API (packages/schemas); thông điệp là khóa i18n trong `validation.*`
 * để giao diện dịch lại theo ngôn ngữ hiện tại.
 */
export const loginForm = z.object({
  email: z
    .string()
    .min(1, "validation.required")
    .refine((v) => emailSchema.safeParse(v).success, "validation.email"),
  password: z.string().min(1, "validation.required"),
});

export const registerForm = z.object({
  email: z
    .string()
    .min(1, "validation.required")
    .refine((v) => emailSchema.safeParse(v).success, "validation.email"),
  password: z
    .string()
    .min(PASSWORD_MIN, "validation.passwordMin")
    .max(PASSWORD_MAX, "validation.passwordMin")
    .refine((v) => strongPasswordSchema.safeParse(v).success, "validation.passwordCommon"),
  displayName: z
    .string()
    .refine((v) => displayNameSchema.safeParse(v).success, "validation.nameInvalid"),
  acceptTerms: z.boolean().refine((v) => v === true, "validation.terms"),
});

export const forgotForm = z.object({
  email: z
    .string()
    .min(1, "validation.required")
    .refine((v) => emailSchema.safeParse(v).success, "validation.email"),
});

export const resetForm = z.object({
  password: registerForm.shape.password,
});

export const profileForm = z.object({
  displayName: registerForm.shape.displayName,
  locale: z.enum(["vi", "en"]),
  countryCode: z
    .string()
    .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), "validation.nameInvalid"),
  bio: z.string().max(160, "validation.nameInvalid"),
});

export type LoginForm = z.infer<typeof loginForm>;
export type RegisterForm = z.infer<typeof registerForm>;
