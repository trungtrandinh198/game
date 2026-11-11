import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface ConnectionOptions {
  max?: number;
  /** Thứ tự tìm bảng; mặc định theo role (Supabase: "$user", public, extensions). */
  searchPath?: string[];
}

/** Supabase bắt buộc TLS; chứng chỉ gốc của họ không có trong kho tin cậy của Node nên cho phép đặt CA riêng. */
function sslFor(url: string): pg.PoolConfig["ssl"] {
  const { hostname } = new URL(url);
  if (process.env["DATABASE_SSL"] === "false") return undefined;
  const ca = process.env["DATABASE_SSL_CA"];
  if (ca) return { ca };
  const remote = hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  return remote || process.env["DATABASE_SSL"] === "true"
    ? { rejectUnauthorized: false }
    : undefined;
}

/** Client chạy câu lệnh khởi tạo phiên xong rồi mới được pool giao cho người dùng. */
function clientWithInit(init: string): typeof pg.Client {
  type Connect = (this: pg.Client, callback?: (err?: Error) => void) => Promise<void> | void;
  const original = pg.Client.prototype.connect as unknown as Connect;
  class InitClient extends pg.Client {}
  const connect: Connect = function (callback) {
    if (!callback) {
      return (original.call(this) as Promise<void>)
        .then(() => this.query(init))
        .then(() => undefined);
    }
    original.call(this, (err?: Error) => {
      if (err) return callback(err);
      this.query(init).then(
        () => callback(),
        (e: Error) => callback(e),
      );
    });
  };
  (InitClient.prototype as unknown as { connect: Connect }).connect = connect;
  return InitClient;
}

export function createPool(url: string, options: ConnectionOptions = {}): pg.Pool {
  // Một số pooler đặt extra_float_digits=0 làm `real` mất độ chính xác khi đọc lại (-20.003488 thành -20.0035).
  const statements = ["SET TIME ZONE 'UTC'", "SET extra_float_digits = 1"];
  if (options.searchPath) {
    const path = options.searchPath.map((s) => `"${s.replace(/"/g, '""')}"`).join(", ");
    statements.push(`SET search_path TO ${path}`);
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    ssl: sslFor(url),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    Client: clientWithInit(statements.join("; ")),
  } as pg.PoolConfig);
  // Lỗi của kết nối nhàn rỗi không được làm sập tiến trình.
  pool.on("error", () => undefined);
  return pool;
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}
