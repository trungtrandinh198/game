import { createPool } from "../client";
import { requireEnv } from "../env";
import { runMigrations } from "../migrate";

const pool = createPool(requireEnv("MIGRATION_DATABASE_URL"), { max: 1 });
try {
  await runMigrations(pool);
  console.log("Migration xong.");
} finally {
  await pool.end();
}
