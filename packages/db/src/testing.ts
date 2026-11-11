import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { createDb, createPool, type Database } from "./client";
import { requireEnv } from "./env";
import { runMigrationsInSchema } from "./migrate";

export interface TestDatabase {
  db: Database;
  pool: pg.Pool;
  schema: string;
  /** Chạy `fn` trong transaction rồi luôn rollback, trả về giá trị của `fn`. */
  rollback<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  /** Như `rollback` nhưng chuyển sang role Postgres `role` (SET LOCAL ROLE) trước khi chạy `fn`. */
  asRole<T>(role: "dnw_api" | "dnw_realtime", fn: (tx: Database) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
}

class Rollback extends Error {}

/**
 * Tạo schema riêng `dnw_test_<ngẫu nhiên>` trong TEST_DATABASE_URL, chạy toàn bộ migration vào đó.
 * Dùng schema thay vì database riêng vì Supabase chỉ có một database; không đụng dữ liệu ngoài schema này.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const schema = `dnw_test_${randomBytes(6).toString("hex")}`;
  const pool = createPool(requireEnv("TEST_DATABASE_URL"), {
    max: 4,
    searchPath: [schema, "public", "extensions"],
  });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  try {
    await runMigrationsInSchema(pool, schema);
  } catch (e) {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`).catch(() => undefined);
    await pool.end();
    throw e;
  }
  const db = createDb(pool);

  const rollback: TestDatabase["rollback"] = async (fn) => {
    let result!: Awaited<ReturnType<typeof fn>>;
    try {
      await db.transaction(async (tx) => {
        result = await fn(tx as unknown as Database);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return result;
  };

  return {
    db,
    pool,
    schema,
    rollback,
    asRole: (role, fn) =>
      rollback(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        return fn(tx);
      }),
    async drop() {
      try {
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await pool.end();
      }
    },
  };
}
