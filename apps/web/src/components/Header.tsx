"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES } from "@/i18n/config";
import { useLogout, useMe } from "@/lib/hooks";
import { Button } from "./ui";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <nav aria-label={t("language")} className="flex gap-1">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={`/${l}${rest ? `/${rest}` : ""}`}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          onClick={() => {
            document.cookie = `dnw_locale=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          className={`rounded-md px-2 py-1 text-sm uppercase ${l === locale ? "bg-sky-400 text-slate-900" : "border border-[var(--border)] text-[var(--text)]"}`}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  const t = useTranslations("common");
  const locale = useLocale();
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <Link href={`/${locale}`} className="text-lg font-semibold text-[var(--text)] no-underline">
        {t("appName")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {me ? (
          <>
            <Link href={`/${locale}/character`}>{t("character")}</Link>
            <Link href={`/${locale}/profile`}>{t("profile")}</Link>
            <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {t("logout")}
            </Button>
          </>
        ) : (
          <>
            <Link href={`/${locale}/login`}>{t("login")}</Link>
            <Link href={`/${locale}/register`}>{t("register")}</Link>
          </>
        )}
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export function Footer() {
  const t = useTranslations("common");
  const locale = useLocale();
  return (
    <footer className="flex flex-wrap justify-center gap-4 border-t border-[var(--border)] px-4 py-4 text-sm text-[var(--muted)]">
      <Link href={`/${locale}/legal/privacy`}>{t("privacy")}</Link>
      <Link href={`/${locale}/legal/terms`}>{t("terms")}</Link>
      <Link href={`/${locale}/legal/credits`}>{t("credits")}</Link>
    </footer>
  );
}

/** Khung chung cho các trang có tiêu đề + nội dung ở giữa. */
export function Page({ children, narrow = true }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className={`safe-area mx-auto w-full flex-1 ${narrow ? "max-w-md" : "max-w-4xl"}`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
