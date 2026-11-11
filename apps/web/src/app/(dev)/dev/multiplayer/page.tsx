import { Suspense } from "react";
import { MultiplayerClient } from "./MultiplayerClient";

export const metadata = { title: "Multiplayer | Da Nang World" };

export default function MultiplayerPage() {
  return (
    <Suspense fallback={<p style={{ padding: 16 }}>Đang tải...</p>}>
      <MultiplayerClient />
    </Suspense>
  );
}
