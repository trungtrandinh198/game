import { config } from "dotenv";
import { fileURLToPath } from "node:url";

let loaded = false;

/** Nạp `.env` ở gốc repo một lần (không ghi đè biến đã có trong môi trường). */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return value;
}
