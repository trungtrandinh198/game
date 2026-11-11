import { join } from "node:path";
import { parseArgs } from "node:util";
import { config as loadDotenv } from "dotenv";
import { createDb, createPool } from "@dnw/db";
import { createS3Store } from "@dnw/content-cli/publish";
import { defaultContentRoot, defaultDistRoot, exists, REPO_ROOT } from "@dnw/content-cli/paths";
import { buildMap, MapBuildError, zoneRoot } from "./build";
import { downloadOsm } from "./download";
import { publishMap } from "./publish";
import { writeSuggestedSpawns } from "./suggest";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    zone: { type: "string" },
    env: { type: "string", default: "dev" },
    "map-version": { type: "string" },
    max: { type: "string" },
    local: { type: "boolean", default: false },
  },
});
const command = positionals[0];
const zone = values.zone;
if (!command || !zone) {
  console.error(
    "Dùng: pnpm map:<download|build|publish|suggest-vehicle-spawns> --zone <code> [--map-version N] [--env dev]",
  );
  process.exit(1);
}

const contentRoot = defaultContentRoot();
const outDir = join(defaultDistRoot(), "..", "maps");
const mapVersion = Number(values["map-version"] ?? 1);

async function loadEnv(env: string) {
  const specific = join(REPO_ROOT, `.env.${env}`);
  loadDotenv({ path: (await exists(specific)) ? specific : join(REPO_ROOT, ".env"), quiet: true });
}

try {
  switch (command) {
    case "download": {
      const r = await downloadOsm(contentRoot, zone);
      console.log(`Đã tải ${r.elements} phần tử OSM vào ${r.rawPath}`);
      break;
    }
    case "build": {
      const r = await buildMap({ contentRoot, zone, outDir, mapVersion });
      const total = r.chunks.reduce((a, c) => a + c.glb.byteLength, 0);
      console.log(
        `Đã build ${r.chunks.length} chunk (v${mapVersion}), tổng static.glb ${(total / 1048576).toFixed(2)} MB, trung bình ${(total / r.chunks.length / 1048576).toFixed(2)} MB -> ${zoneRoot(outDir, zone, mapVersion)}`,
      );
      break;
    }
    case "publish": {
      await loadEnv(values.env!);
      const url = process.env["MIGRATION_DATABASE_URL"];
      if (!url) throw new Error("Thiếu MIGRATION_DATABASE_URL");
      const pool = createPool(url, { max: 1 });
      // --local: tệp đã nằm trong dist/maps (realtime/web đọc trực tiếp), chỉ ghi DB; dùng khi chưa có S3/CDN.
      const store = values.local
        ? { exists: async () => true, put: async () => undefined }
        : createS3Store(process.env);
      try {
        const r = await publishMap({
          outDir,
          zone,
          mapVersion,
          store,
          db: createDb(pool),
        });
        console.log(
          `Đã tải lên ${r.uploaded} tệp (bỏ qua ${r.skipped}), ghi ${r.chunkRows} dòng map_chunks`,
        );
      } finally {
        await pool.end();
      }
      break;
    }
    case "suggest-vehicle-spawns": {
      const raw = join(contentRoot, "maps", zone, "raw", `${zone}.osm.json`);
      const n = await writeSuggestedSpawns(
        contentRoot,
        zone,
        raw,
        values.max ? Number(values.max) : undefined,
      );
      console.log(
        `Đã ghi ${n} điểm đậu xe đề xuất vào vehicle_spawns.json; hãy duyệt lại trước khi commit.`,
      );
      break;
    }
    default:
      console.error(`Lệnh không biết: ${command}`);
      process.exitCode = 1;
  }
} catch (e) {
  if (e instanceof MapBuildError) {
    console.error(e.message);
    process.exitCode = 1;
  } else throw e;
}
