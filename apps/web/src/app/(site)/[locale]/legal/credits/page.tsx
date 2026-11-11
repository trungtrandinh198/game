import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { Page } from "@/components/Header";
import { isLocale, MESSAGES } from "@/i18n/config";

async function readCredits(): Promise<string> {
  try {
    // CREDITS.md do `pnpm content:credits` sinh từ trường license của mọi mục content
    return await readFile(join(process.cwd(), "..", "..", "content", "CREDITS.md"), "utf8");
  } catch {
    return "";
  }
}

export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = MESSAGES[locale].legal;
  const credits = await readCredits();
  return (
    <Page narrow={false}>
      <h1 className="mb-4 text-2xl font-semibold">{t.creditsTitle}</h1>
      <p className="mb-4">
        {t.osm} <a href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</a>
      </p>
      <pre
        className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--panel)] p-4 text-sm"
        data-testid="credits"
      >
        {credits}
      </pre>
    </Page>
  );
}
