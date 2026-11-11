import { createInterface } from "node:readline";
import { createDb, createPool } from "../client";
import { AdminCreateError, createAdmin } from "../admin";
import { requireEnv } from "../env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Nhập mật khẩu không hiện ký tự trên màn hình. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    out._writeToOutput = (s) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const email = arg("email");
if (!email) {
  console.error("Dùng: pnpm admin:create --email <email> [--name <tên hiển thị>]");
  process.exit(1);
}

// ADMIN_PASSWORD chỉ để chạy tự động tạm thời; không đặt vào .env lâu dài.
const password = process.env["ADMIN_PASSWORD"] ?? (await promptHidden("Mật khẩu (>= 12 ký tự): "));
const displayName =
  arg("name") ??
  email
    .split("@")[0]!
    .replace(/[^\p{L}\p{N} _.-]/gu, "_")
    .slice(0, 32)
    .padEnd(3, "_");

const pool = createPool(requireEnv("MIGRATION_DATABASE_URL"), { max: 1 });
try {
  const { userId } = await createAdmin(createDb(pool), { email, password, displayName });
  console.log(`Đã tạo super_admin ${userId} (${email.toLowerCase()}).`);
} catch (e) {
  if (e instanceof AdminCreateError) {
    console.error(`Lỗi: ${e.message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
} finally {
  await pool.end();
}
