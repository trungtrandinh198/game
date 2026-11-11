"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { forgotForm } from "@/lib/forms";
import { useErrorText } from "@/lib/hooks";

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const locale = useLocale();
  const errorText = useErrorText();
  const form = useForm<{ email: string }>({
    resolver: zodResolver(forgotForm),
    defaultValues: { email: "" },
  });
  const send = useMutation({ mutationFn: (v: { email: string }) => api.forgotPassword(v.email) });
  const err = form.formState.errors.email?.message;

  return (
    <Page>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t("auth.forgot.title")}</h1>
        {send.isSuccess ? (
          <Alert kind="ok">{t("auth.forgot.sent")}</Alert>
        ) : (
          <form
            onSubmit={form.handleSubmit((v) => send.mutate(v))}
            className="grid gap-4"
            noValidate
          >
            {send.error && <Alert>{errorText(send.error)}</Alert>}
            <Field id="email" label={t("auth.email")} error={err ? t(err) : undefined}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!err}
                aria-describedby="email-error"
                {...form.register("email")}
              />
            </Field>
            <Button type="submit" disabled={send.isPending}>
              {t("auth.forgot.submit")}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm">
          <Link href={`/${locale}/login`}>{t("common.login")}</Link>
        </p>
      </Card>
    </Page>
  );
}
