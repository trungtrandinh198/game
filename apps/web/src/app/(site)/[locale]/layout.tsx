import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { isLocale, LOCALES, MESSAGES } from "@/i18n/config";
import "../../globals.css";

export const metadata: Metadata = { title: "Da Nang World" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body>
        <Providers locale={locale} messages={MESSAGES[locale]}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
