import { Suspense } from "react";
import { BenchClient } from "./BenchClient";

export const metadata = { title: "Bench G1 | Da Nang World" };

export default function BenchPage() {
  return (
    <Suspense fallback={<p style={{ padding: 16 }}>Đang tải...</p>}>
      <BenchClient />
    </Suspense>
  );
}
