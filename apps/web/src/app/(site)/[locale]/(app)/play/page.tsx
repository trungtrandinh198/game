"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ConnectionLost, ControlsHelp, LoadingScreen } from "@/components/play/screens";
import { Page } from "@/components/Header";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useGuard } from "@/lib/hooks";
import { useSettings } from "@/lib/settings-store";

// Game chỉ chạy ở client, không render phía server (mục 15.5).
const GameSlot = dynamic(() => import("@/components/play/GameSlot"), { ssr: false });

export default function PlayPage() {
  const t = useTranslations();
  const allowed = useGuard("character");
  const zones = useQuery({ queryKey: ["zones"], queryFn: api.zones, enabled: allowed, retry: 1 });
  const zone = zones.data?.[0];

  const [progress, setProgress] = useState({ ratio: 0, label: undefined as string | undefined });
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState<{ code: number | null; fatal: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const dismissed = useSettings((s) => s.controlsHelpDismissed);

  useEffect(() => {
    if (ready && !dismissed) setHelpOpen(true);
  }, [ready, dismissed]);

  const onProgress = useCallback(
    (p: { ratio: number; label?: string }) => setProgress({ ratio: p.ratio, label: p.label }),
    [],
  );
  const onReady = useCallback(() => setReady(true), []);
  const onLost = useCallback((info: { code: number | null; fatal: boolean }) => setLost(info), []);
  const retry = useCallback(() => {
    setLost(null);
    setReady(false);
    setProgress({ ratio: 0, label: undefined });
    setAttempt((n) => n + 1);
  }, []);

  if (!allowed)
    return (
      <Page>
        <p>{t("common.loading")}</p>
      </Page>
    );
  if (zones.isError) return <ConnectionLost onRetry={() => void zones.refetch()} />;
  if (zones.isSuccess && !zone) {
    return (
      <Page>
        <Alert>{t("play.noZone")}</Alert>
      </Page>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {zone && (
        <GameSlot
          key={attempt}
          zone={zone}
          onProgress={onProgress}
          onReady={onReady}
          onLost={onLost}
        />
      )}
      {!ready && (
        <LoadingScreen
          zoneName={zone?.name ?? "..."}
          ratio={progress.ratio}
          {...(progress.label ? { label: progress.label } : {})}
        />
      )}
      {ready && (
        <Button
          variant="ghost"
          className="absolute right-3 top-3 z-10 bg-black/40"
          onClick={() => setHelpOpen(true)}
        >
          {t("play.help")}
        </Button>
      )}
      <ControlsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {lost && (
        <ConnectionLost
          onRetry={retry}
          {...(lost.code !== null && lost.code >= 4011 && lost.code <= 4016
            ? { message: t(`play.close.${lost.code}`) }
            : {})}
        />
      )}
    </div>
  );
}
