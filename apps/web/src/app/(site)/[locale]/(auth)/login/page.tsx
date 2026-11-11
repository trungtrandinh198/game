"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { loginForm, type LoginForm } from "@/lib/forms";
import { ME_KEY, useErrorText, useGuard } from "@/lib/hooks";

export default function LoginPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const allowed = useGuard("guest");
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginForm),
    defaultValues: { email: "", password: "" },
  });
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      router.push(`/${locale}/${user.hasCharacter ? "play" : "character"}`);
    },
  });
  const { errors } = form.formState;
  const msg = (key?: string) => (key ? t(key) : undefined);

  return (
    <Page>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t("auth.login.title")}</h1>
        {allowed && (
          <form
            onSubmit={form.handleSubmit((v) => login.mutate(v))}
            className="grid gap-4"
            noValidate
          >
            {login.error && <Alert>{errorText(login.error)}</Alert>}
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
            <Field id="password" label={t("auth.password")} error={msg(errors.password?.message)}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby="password-error"
                {...form.register("password")}
              />
            </Field>
            <Button type="submit" disabled={login.isPending}>
              {t("auth.login.submit")}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm">
          <Link href={`/${locale}/forgot-password`}>{t("auth.login.forgot")}</Link>
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("auth.login.noAccount")}{" "}
          <Link href={`/${locale}/register`}>{t("auth.login.goRegister")}</Link>
        </p>
      </Card>
    </Page>
  );
}
