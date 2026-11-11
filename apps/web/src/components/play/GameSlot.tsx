"use client";

import { DEFAULT_LABELS, GameClient, type GameLabels, type LoadStage } from "@dnw/game-client";
import { NOTICE_CODES, type ZoneDto } from "@dnw/schemas";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api-client";
import { useSettings } from "@/lib/settings-store";

export interface GameSlotProps {
  zone: ZoneDto;
  onProgress: (progress: { ratio: number; label?: string }) => void;
  onReady: () => void;
  onLost: (info: { code: number | null; fatal: boolean }) => void;
}

const CLOSE_CODES = [4011, 4012, 4013, 4014, 4015, 4016] as const;

/** Gắn game thật vào trang `play`: join qua API, nạp bản đồ, kết nối realtime, văn bản theo ngôn ngữ. */
export default function GameSlot({ zone, onProgress, onReady, onLost }: GameSlotProps) {
  const t = useTranslations("play");
  const { cameraSensitivity, invertY } = useSettings();

  const labels = useMemo<GameLabels>(
    () => ({
      ...DEFAULT_LABELS,
      notices: Object.fromEntries(NOTICE_CODES.map((c) => [c, t(`game.notices.${c}`)])),
      closes: Object.fromEntries(CLOSE_CODES.map((c) => [c, t(`close.${c}`)])),
      kinds: {
        bicycle: t("game.kinds.bicycle"),
        motorbike: t("game.kinds.motorbike"),
        car: t("game.kinds.car"),
      },
      mountPrompt: t("game.mountPrompt", { kind: "{kind}" }),
      dismountPrompt: t("game.dismountPrompt"),
      reconnecting: t("game.reconnecting"),
      disconnected: t("game.disconnected"),
    }),
    [t],
  );

  const join = useCallback(() => api.join(zone.code), [zone.code]);
  const loadAvatars = useCallback(
    async () => (await api.avatars()).map((a) => ({ code: a.code, modelUrl: a.modelUrl })),
    [],
  );
  const handleProgress = useCallback(
    (p: { ratio: number; stage: LoadStage }) =>
      onProgress({ ratio: p.ratio, label: t(`stage.${p.stage}`) }),
    [onProgress, t],
  );

  return (
    <GameClient
      indexUrl={zone.indexUrl}
      join={join}
      loadAvatars={loadAvatars}
      labels={labels}
      camera={{ sensitivity: cameraSensitivity, invertY }}
      onProgress={handleProgress}
      onReady={onReady}
      onLost={onLost}
    />
  );
}
