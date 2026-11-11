import { discover, KIND_LAYOUT } from "./paths";

interface Row {
  kind: string;
  id: string;
  author: string;
  license: string;
  sourceUrl: string;
}

/** `CREDITS.md` sinh từ trường `license` của mọi mục (mục 16.12). */
export async function generateCredits(root: string): Promise<string> {
  const rows: Row[] = [];
  for (const item of await discover(root)) {
    const raw = item.raw as
      { license?: { author?: string; license?: string; sourceUrl?: string } } | undefined;
    if (!raw?.license) continue;
    rows.push({
      kind: KIND_LAYOUT[item.kind].dir,
      id: item.dirName,
      author: raw.license.author ?? "?",
      license: raw.license.license ?? "?",
      sourceUrl: raw.license.sourceUrl ?? "",
    });
  }
  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const lines = [
    "# Ghi công",
    "",
    "Tệp này được sinh tự động bằng `pnpm content:credits`; không sửa tay.",
    "",
    "Dữ liệu bản đồ © OpenStreetMap contributors (ODbL).",
    "",
    "| Nhóm | Mục | Tác giả | Giấy phép | Nguồn |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.kind} | ${esc(r.id)} | ${esc(r.author)} | ${esc(r.license)} | ${esc(r.sourceUrl)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
