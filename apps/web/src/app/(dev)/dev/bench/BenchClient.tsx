"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const BenchGame = dynamic(() => import("@dnw/game-client").then((m) => m.BenchGame), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Đang tải...</p>,
});

const QUALITIES = ["low", "medium", "high"] as const;

function num(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Tham số: ?quality=low|medium|high &auto=1 &quick=1 &bots=10 &walk=60 &drive=60 (giây).
 * `quick` chỉ để kiểm tra nhanh, không dùng để kết luận G1.
 */
export function BenchClient() {
  const params = useSearchParams();
  const q = params.get("quality");
  const quality = QUALITIES.find((v) => v === q);
  const bots = num(params.get("bots"));
  const walk = num(params.get("walk"));
  const drive = num(params.get("drive"));
  return (
    <BenchGame
      {...(quality ? { quality } : {})}
      auto={params.get("auto") === "1"}
      quick={params.get("quick") === "1"}
      {...(bots !== undefined ? { bots } : {})}
      {...(walk !== undefined ? { walkSeconds: walk } : {})}
      {...(drive !== undefined ? { driveSeconds: drive } : {})}
    />
  );
}
