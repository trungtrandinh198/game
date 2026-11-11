"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { useSettings } from "@/lib/settings-store";

export function LoadingScreen({
  zoneName,
  ratio,
  label,
}: {
  zoneName: string;
  ratio: number;
  label?: string;
}) {
  const t = useTranslations("play");
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      className="safe-area fixed inset-0 z-20 grid place-content-center gap-4 bg-[var(--bg)] text-center"
      data-testid="loading-screen"
    >
      <h1 className="text-2xl font-semibold">{t("loadingZone", { zone: zoneName })}</h1>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mx-auto h-2 w-64 overflow-hidden rounded-full bg-slate-700"
      >
        <div className="h-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-[var(--muted)]">{label ?? t("preparing")}</p>
    </div>
  );
}

export function ConnectionLost({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const t = useTranslations();
  return (
    <div
      className="safe-area fixed inset-0 z-30 grid place-content-center gap-4 bg-[var(--bg)]/95 text-center"
      role="alertdialog"
      aria-labelledby="lost-title"
      data-testid="connection-lost"
    >
      <h1 id="lost-title" className="text-2xl font-semibold">
        {t("play.lostTitle")}
      </h1>
      <p className="max-w-sm text-[var(--muted)]">{message ?? t("play.lostBody")}</p>
      <div>
        <Button onClick={onRetry}>{t("common.retry")}</Button>
      </div>
    </div>
  );
}

/** Hướng dẫn điều khiển (3.1), gồm phần lái xe; hiện lần đầu và mở lại bằng nút Hướng dẫn. */
export function ControlsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("controls");
  const { controlsHelpDismissed, set } = useSettings();
  if (!open) return null;
  return (
    <div
      className="safe-area fixed inset-0 z-30 grid place-content-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="controls-title"
      data-testid="controls-help"
    >
      <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <h2 id="controls-title" className="mb-3 text-xl font-semibold">
          {t("title")}
        </h2>
        <ul className="grid gap-2 text-[var(--text)]">
          {(["move", "run", "camera", "interact", "drive", "touch"] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <label className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            className="size-5"
            checked={controlsHelpDismissed}
            onChange={(e) => set({ controlsHelpDismissed: e.target.checked })}
          />
          {t("dontShow")}
        </label>
        <Button className="mt-4 w-full" onClick={onClose}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
