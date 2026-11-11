import { Suspense } from "react";
import { MapViewerClient } from "./MapViewerClient";

export const metadata = { title: "Map viewer | Da Nang World" };

export default function MapViewerPage() {
  return (
    <Suspense fallback={<p style={{ padding: 16 }}>Đang tải...</p>}>
      <MapViewerClient />
    </Suspense>
  );
}
