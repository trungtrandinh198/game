import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".webp": "image/webp",
};

/**
 * Chỉ dành cho dev: CDN giả khi chưa có object storage. Khóa `zones/**` lấy từ `dist/maps`
 * (`pnpm map:build`), còn lại từ `dist/content` (`pnpm content:build`).
 * Đặt `CDN_BASE_URL=http://localhost:3000/dev/map-data` để API trả URL trỏ về đây.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const { path } = await ctx.params;
  const root = join(process.cwd(), "..", "..", "dist", path[0] === "zones" ? "maps" : "content");
  const full = normalize(join(root, ...path));
  if (!full.startsWith(root + sep)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(full);
    const ext = full.slice(full.lastIndexOf("."));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
