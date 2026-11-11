"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

// Game chỉ chạy ở client, không render phía server (mục 5.2).
const OnlineGame = dynamic(() => import("@dnw/game-client").then((m) => m.OnlineGame), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Đang tải...</p>,
});

export function MultiplayerClient() {
  const params = useSearchParams();
  const name = params.get("name") ?? undefined;
  const user = params.get("user") ?? undefined;
  const ops = params.get("ops") ?? undefined;
  return (
    <OnlineGame
      {...(name ? { name } : {})}
      {...(user ? { userId: user } : {})}
      {...(ops ? { opsUrl: ops } : {})}
    />
  );
}
