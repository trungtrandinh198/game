"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const MapViewer = dynamic(() => import("@dnw/game-client").then((m) => m.MapViewer), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Đang tải...</p>,
});

/** `?index=<url>` (mặc định: bản build cục bộ qua /dev/map-data). */
export function MapViewerClient() {
  const params = useSearchParams();
  const index = params.get("index") ?? "/dev/map-data/zones/han-river-core/v1/index.json";
  return <MapViewer indexUrl={index} />;
}
