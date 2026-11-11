import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await migrate(createDb(pool), { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Chỉ cho test: chạy đúng SQL của migration trong một schema riêng.
 * drizzle-kit ghi cứng `"public".` vào khóa ngoại nên phải thay tên schema.
 */
export async function runMigrationsInSchema(pool: pg.Pool, schema: string): Promise<void> {
  const statements = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER }).flatMap(
    (m) => m.sql,
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement.replaceAll('"public".', `"${schema}".`));
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
