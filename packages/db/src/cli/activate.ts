import { eq } from "drizzle-orm";
import { createDb, createPool } from "../client";
import { requireEnv } from "../env";
import { avatars, vehicleTypes, worldZones } from "../schema";

/**
 * Dev: bật zone (cần đã publish bản đồ) cùng mọi loại xe và avatar để chơi thử cục bộ.
 * Môi trường thật dùng trang admin (T17) để bật từng mục.
 */
const zone = process.argv[2];
if (!zone) throw new Error("Dùng: pnpm --filter @dnw/db activate <zone-code>");

const pool = createPool(requireEnv("MIGRATION_DATABASE_URL"), { max: 1 });
try {
  const db = createDb(pool);
  const [row] = await db.select().from(worldZones).where(eq(worldZones.code, zone));
  if (!row) throw new Error(`Zone "${zone}" chưa có; chạy content:sync`);
  if (row.mapVersion < 1) throw new Error(`Zone "${zone}" chưa publish bản đồ (map:publish)`);
  await db.update(worldZones).set({ status: "active" }).where(eq(worldZones.id, row.id));
  await db.update(vehicleTypes).set({ isActive: true });
  await db.update(avatars).set({ isActive: true });
  console.log(`Đã bật zone ${zone} (map v${row.mapVersion}), mọi loại xe và avatar.`);
} finally {
  await pool.end();
}
