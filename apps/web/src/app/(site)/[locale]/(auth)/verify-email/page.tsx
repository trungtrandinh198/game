"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useErrorText } from "@/lib/hooks";

function Verify() {
  const t = useTranslations();
  const locale = useLocale();
  const token = useSearchParams().get("token");
  const errorText = useErrorText();
  const verify = useMutation({ mutationFn: (tk: string) => api.verifyEmail(tk) });
  const resend = useMutation({ mutationFn: (email: string) => api.resendVerification(email) });
  const started = useRef(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // Token chỉ dùng được một lần nên tránh gọi hai lần khi React chạy effect kép ở chế độ dev
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <div className="grid gap-4">
      {!token && <Alert>{t("auth.verify.missingToken")}</Alert>}
      {token && verify.isPending && <p>{t("auth.verify.verifying")}</p>}
      {verify.isSuccess && (
        <div className="grid gap-3" data-testid="verify-success">
          <Alert kind="ok">{t("auth.verify.success")}</Alert>
          <Link href={`/${locale}/login`}>{t("common.login")}</Link>
        </div>
      )}
      {verify.error && <Alert>{errorText(verify.error)}</Alert>}
      {(verify.error || !token) && (
        <div className="grid gap-2">
          <h2 className="text-lg font-medium">{t("auth.verify.resendTitle")}</h2>
          {resend.isSuccess ? (
            <Alert kind="ok">{t("auth.verify.resendSent")}</Alert>
          ) : (
            <>
              <Field id="email" label={t("auth.email")}>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Button
                variant="ghost"
                disabled={!email || resend.isPending}
                onClick={() => resend.mutate(email)}
              >
                {t("auth.verify.resend")}
              </Button>
              {resend.error && <Alert>{errorText(resend.error)}</Alert>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  const t = useTranslations();
  return (
    <Page>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t("auth.verify.title")}</h1>
        <Suspense fallback={<p>{t("common.loading")}</p>}>
          <Verify />
        </Suspense>
      </Card>
    </Page>
  );
}
