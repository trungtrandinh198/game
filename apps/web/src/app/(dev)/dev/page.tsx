import Link from "next/link";

export default function DevIndexPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Da Nang World (dev)</h1>
      <p>
        <Link href="/vi">Trang chính (vi)</Link> · <Link href="/en">Main site (en)</Link>
      </p>
      <p>
        <Link href="/dev/sandbox">Mở sandbox 3D (T02)</Link>
      </p>
      <p>
        <Link href="/dev/multiplayer">Mở multiplayer dev (T03, cần chạy realtime server)</Link>
      </p>
      <p>
        <Link href="/dev/bench">Đo hiệu năng cổng G1 (T04)</Link>
      </p>
      <p>
        <Link href="/dev/map-viewer">Map viewer (T09, cần pnpm map:build)</Link>
      </p>
    </main>
  );
}
