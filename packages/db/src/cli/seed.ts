import { createDb, createPool } from "../client";
import { requireEnv } from "../env";
import { seed } from "../seed";

const dev = process.argv.includes("--dev");
const pool = createPool(requireEnv("MIGRATION_DATABASE_URL"), { max: 1 });
try {
  await seed(createDb(pool), { dev });
  console.log(dev ? "Seed xong (kèm dữ liệu dev)." : "Seed xong.");
} finally {
  await pool.end();
}
