"use client";

import dynamic from "next/dynamic";

// Game chỉ chạy ở client, không render phía server (mục 5.2).
const Sandbox = dynamic(() => import("@dnw/game-client").then((m) => m.Sandbox), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Đang tải sandbox...</p>,
});

export function SandboxClient() {
  return <Sandbox />;
}
