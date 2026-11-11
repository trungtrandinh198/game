"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { registerForm, type RegisterForm } from "@/lib/forms";
import { useErrorText, useGuard } from "@/lib/hooks";

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale() as "vi" | "en";
  const errorText = useErrorText();
  const allowed = useGuard("guest");
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerForm),
    defaultValues: { email: "", password: "", displayName: "", acceptTerms: false },
  });
  const register = useMutation({
    mutationFn: (v: RegisterForm) => api.register({ ...v, locale, acceptTerms: true }),
  });
  const { errors } = form.formState;
  const msg = (key?: string) => (key ? t(key) : undefined);

  return (
    <Page>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t("auth.register.title")}</h1>
        {register.isSuccess ? (
          <div className="grid gap-3" data-testid="register-sent">
            <h2 className="text-lg font-medium">{t("auth.register.sentTitle")}</h2>
            <p className="text-[var(--muted)]">{t("auth.register.sentBody")}</p>
            <Link href={`/${locale}/login`}>{t("common.login")}</Link>
          </div>
        ) : (
          allowed && (
            <form
              onSubmit={form.handleSubmit((v) => register.mutate(v))}
              className="grid gap-4"
              noValidate
            >
              {register.error && <Alert>{errorText(register.error)}</Alert>}
              <Field id="email" label={t("auth.email")} error={msg(errors.email?.message)}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby="email-error"
                  {...form.register("email")}
                />
              </Field>
              <Field
                id="displayName"
                label={t("auth.displayName")}
                error={msg(errors.displayName?.message)}
              >
                <Input
                  id="displayName"
                  autoComplete="nickname"
                  aria-invalid={!!errors.displayName}
                  aria-describedby="displayName-error"
                  {...form.register("displayName")}
                />
              </Field>
              <Field id="password" label={t("auth.password")} error={msg(errors.password?.message)}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  aria-describedby="password-error"
                  {...form.register("password")}
                />
              </Field>
              <div className="grid gap-1">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    id="acceptTerms"
                    type="checkbox"
                    className="mt-1 size-5"
                    aria-describedby="acceptTerms-error"
                    {...form.register("acceptTerms")}
                  />
                  <span>
                    {t("auth.register.acceptTerms")} (
                    <Link href={`/${locale}/legal/terms`}>{t("common.terms")}</Link>,{" "}
                    <Link href={`/${locale}/legal/privacy`}>{t("common.privacy")}</Link>)
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p id="acceptTerms-error" role="alert" className="text-sm text-[var(--danger)]">
                    {t(errors.acceptTerms.message ?? "validation.terms")}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={register.isPending}>
                {t("auth.register.submit")}
              </Button>
            </form>
          )
        )}
        <p className="mt-4 text-sm text-[var(--muted)]">
          {t("auth.register.hasAccount")} <Link href={`/${locale}/login`}>{t("common.login")}</Link>
        </p>
      </Card>
    </Page>
  );
}
