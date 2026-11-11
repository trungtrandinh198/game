import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { config as loadDotenv } from "dotenv";
import { createDb, createPool } from "@dnw/db";
import type { ContentKind } from "@dnw/schemas";
import { buildContent, ContentValidationError, readCatalog } from "./build";
import { generateCredits } from "./credits";
import { newContent } from "./new";
import { defaultContentRoot, defaultDistRoot, exists, REPO_ROOT } from "./paths";
import { createS3Store, publishDist } from "./publish";
import { syncContent } from "./sync";
import { validateContent } from "./validate";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    kind: { type: "string" },
    id: { type: "string" },
    env: { type: "string", default: "dev" },
  },
});
const [command, ...rest] = positionals;

async function loadEnv(env: string): Promise<void> {
  const specific = join(REPO_ROOT, `.env.${env}`);
  loadDotenv({ path: (await exists(specific)) ? specific : join(REPO_ROOT, ".env"), quiet: true });
}

const root = defaultContentRoot();
const dist = defaultDistRoot();

switch (command) {
  case "new": {
    const [kind, id] = rest;
    if (!kind || !id) throw new Error("Dùng: pnpm content:new <kind> <id>");
    console.log(
      `Đã tạo ${await newContent(root, kind, id)}. Đặt model/thumbnail rồi chạy content:validate.`,
    );
    break;
  }
  case "validate": {
    const issues = await validateContent(root, {
      kind: values.kind as ContentKind | undefined,
      id: values.id,
    });
    for (const i of issues) console.error(`[${i.code}] ${i.kind}/${i.id}: ${i.message}`);
    console.log(issues.length === 0 ? "Content hợp lệ." : `${issues.length} lỗi.`);
    process.exitCode = issues.length === 0 ? 0 : 1;
    break;
  }
  case "build": {
    try {
      const catalog = await buildContent(root, dist);
      await writeFile(join(dist, "CREDITS.md"), await generateCredits(root));
      console.log(`Đã build ${catalog.items.length} mục vào ${dist}`);
    } catch (e) {
      if (e instanceof ContentValidationError) {
        for (const i of e.issues) console.error(`[${i.code}] ${i.kind}/${i.id}: ${i.message}`);
        console.error(e.message);
        process.exitCode = 1;
      } else throw e;
    }
    break;
  }
  case "credits": {
    await writeFile(join(root, "CREDITS.md"), await generateCredits(root));
    console.log("Đã ghi content/CREDITS.md");
    break;
  }
  case "publish": {
    await loadEnv(values.env!);
    const result = await publishDist(dist, createS3Store(process.env));
    console.log(
      `Đã tải lên ${result.uploaded.length} tệp, bỏ qua ${result.skipped.length} tệp đã có.`,
    );
    break;
  }
  case "sync": {
    await loadEnv(values.env!);
    const url = process.env["MIGRATION_DATABASE_URL"];
    if (!url) throw new Error("Thiếu MIGRATION_DATABASE_URL");
    const pool = createPool(url, { max: 1 });
    try {
      const result = await syncContent(createDb(pool), root, await readCatalog(dist));
      console.log("Tạo mới:", result.created, "Cập nhật:", result.updated);
    } finally {
      await pool.end();
    }
    break;
  }
  default:
    console.error("Lệnh: new | validate | build | credits | publish | sync");
    process.exitCode = 1;
}
