import { notFound } from "next/navigation";
import { Page } from "@/components/Header";
import { isLocale, MESSAGES } from "@/i18n/config";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = MESSAGES[locale].legal;
  return (
    <Page>
      <h1 className="mb-4 text-2xl font-semibold">{t.privacyTitle}</h1>
      <p className="text-[var(--muted)]">{t.placeholder}</p>
      <p className="mt-4">{t.osm}</p>
    </Page>
  );
}
