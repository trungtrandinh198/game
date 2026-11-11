"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Page } from "@/components/Header";
import { Button } from "@/components/ui";
import { useMe } from "@/lib/hooks";

export default function HomePage() {
  const t = useTranslations("home");
  const locale = useLocale();
  const { data: me } = useMe();
  const target = me ? (me.hasCharacter ? "play" : "character") : "register";
  return (
    <Page narrow={false}>
      <section className="grid gap-6 py-16 text-center">
        <h1 className="text-3xl font-bold sm:text-5xl">{t("title")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-[var(--muted)]">{t("subtitle")}</p>
        <div>
          <Link href={`/${locale}/${target}`} className="no-underline">
            <Button className="px-8 text-lg">{me ? t("ctaLoggedIn") : t("cta")}</Button>
          </Link>
        </div>
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {(["feature1", "feature2", "feature3"] as const).map((k) => (
            <li key={k} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
              {t(k)}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
