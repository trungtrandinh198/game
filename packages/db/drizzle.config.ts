import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  // postgis và pg_trgm tạo bảng/extension riêng; không để drizzle-kit đụng vào.
  extensionsFilters: ["postgis"],
  dbCredentials: { url: process.env["MIGRATION_DATABASE_URL"] ?? "" },
});
