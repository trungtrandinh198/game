import { loadEnv } from "@dnw/db";
import { loadConfig } from "./config";
import { createGameServer } from "./server";

loadEnv();
const config = loadConfig();
const game = createGameServer(config);

await game.start();
const { realtime, ops } = game.ports();
console.log(
  `[realtime] sẵn sàng: ws ${realtime}, ops http ${ops} (${config.nodeEnv}, phòng tối đa ${config.roomCapacity} người)`,
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[realtime] nhận ${signal}, đang tắt...`);
  await game.stop();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
