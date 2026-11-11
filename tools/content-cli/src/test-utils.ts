import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePlaceholders } from "./placeholders/generate";

let basePromise: Promise<string> | undefined;
const dirs: string[] = [];

/** Thư mục content placeholder dùng chung (chỉ đọc) trong một tiến trình test. */
export function baseContent(): Promise<string> {
  basePromise ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), "dnw-content-base-"));
    dirs.push(dir);
    await generatePlaceholders(dir);
    return dir;
  })();
  return basePromise;
}

/** Bản sao riêng để mỗi test tự do sửa. */
export async function freshContent(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dnw-content-"));
  dirs.push(dir);
  await cp(await baseContent(), dir, { recursive: true });
  return dir;
}

export async function tempDir(prefix = "dnw-tmp-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

export async function cleanupTemp(): Promise<void> {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}
