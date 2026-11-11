"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { resetForm } from "@/lib/forms";
import { useErrorText } from "@/lib/hooks";

function ResetForm() {
  const t = useTranslations();
  const locale = useLocale();
  const token = useSearchParams().get("token");
  const errorText = useErrorText();
  const form = useForm<{ password: string }>({
    resolver: zodResolver(resetForm),
    defaultValues: { password: "" },
  });
  const reset = useMutation({
    mutationFn: (v: { password: string }) => api.resetPassword(token ?? "", v.password),
  });
  const err = form.formState.errors.password?.message;

  if (!token) return <Alert>{t("auth.reset.missingToken")}</Alert>;
  if (reset.isSuccess) {
    return (
      <div className="grid gap-3">
        <Alert kind="ok">{t("auth.reset.success")}</Alert>
        <Link href={`/${locale}/login`}>{t("common.login")}</Link>
      </div>
    );
  }
  return (
    <form onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="grid gap-4" noValidate>
      {reset.error && <Alert>{errorText(reset.error)}</Alert>}
      <Field id="password" label={t("auth.password")} error={err ? t(err) : undefined}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!err}
          aria-describedby="password-error"
          {...form.register("password")}
        />
      </Field>
      <Button type="submit" disabled={reset.isPending}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations();
  return (
    <Page>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t("auth.reset.title")}</h1>
        <Suspense fallback={<p>{t("common.loading")}</p>}>
          <ResetForm />
        </Suspense>
      </Card>
    </Page>
  );
}
