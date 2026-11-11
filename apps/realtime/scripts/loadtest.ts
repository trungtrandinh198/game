/**
 * Kiểm tải: N bot đi bộ ngẫu nhiên, một phần bot lên xe và lái. In p50/p95 thời gian tick từ /metrics
 * của server và băng thông tải xuống trung bình mỗi bot.
 *
 *   pnpm loadtest -- --clients 30 --seconds 30
 *   pnpm loadtest -- --url ws://host:2567 --ops http://host:2568
 */
import { CityState } from "@dnw/schemas";

interface Args {
  clients: number;
  seconds: number;
  url: string;
  ops: string;
  vehicleBots: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
  };
  const clients = Number(get("clients", "30"));
  return {
    clients,
    seconds: Number(get("seconds", "30")),
    url: get("url", "ws://localhost:2567"),
    ops: get("ops", "http://localhost:2568"),
    vehicleBots: Number(get("vehicle-bots", String(Math.min(5, Math.floor(clients / 6))))),
  };
}

// Đếm byte nhận được: SDK dùng WebSocket gốc của Node, nên bọc lớp toàn cục (dữ liệu có thể là ArrayBuffer hoặc Blob).
let bytesReceived = 0;
const NativeWebSocket = globalThis.WebSocket;
class CountingWebSocket extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.addEventListener("message", (e: MessageEvent) => {
      const d = e.data as ArrayBuffer | Blob | string;
      if (typeof d === "string") bytesReceived += d.length;
      else if (d instanceof ArrayBuffer) bytesReceived += d.byteLength;
      else bytesReceived += d.size;
    });
  }
}
globalThis.WebSocket = CountingWebSocket as unknown as typeof WebSocket;

// SDK chốt WebSocket lúc nạp module nên phải import sau khi đã bọc.
const { Client } = await import("@colyseus/sdk");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Bot {
  index: number;
  closeCode: number | null;
  stop: () => void;
}

async function startBot(index: number, args: Args, deadline: number): Promise<Bot> {
  const res = await fetch(
    `${args.ops}/dev/ticket?name=Bot${index}&user=bot-${index}-${Date.now()}`,
  );
  if (!res.ok) throw new Error(`ticket ${res.status}`);
  const t = (await res.json()) as { ticket: string; zoneCode: string; protocolVersion: number };
  const client = new Client(args.url);
  const room = await client.joinOrCreate(
    "city",
    { ticket: t.ticket, zoneCode: t.zoneCode, protocolVersion: t.protocolVersion },
    CityState,
  );
  const bot: Bot = { index, closeCode: null, stop: () => void room.leave() };
  room.onLeave((code: number) => {
    bot.closeCode = code;
  });
  room.onMessage("notice", () => {});

  const wantsVehicle = index < args.vehicleBots;
  let seq = 0;
  let yaw = Math.random() * Math.PI * 2;
  let nextTurn = 0;
  let mountedAt = 0;

  void (async () => {
    while (Date.now() < deadline && bot.closeCode === null) {
      const now = Date.now();
      const state = room.state as CityState;
      const me = state.players.get(room.sessionId);
      if (me) {
        if (me.vehicleId) {
          if (now >= nextTurn) {
            nextTurn = now + 800 + Math.random() * 1500;
            yaw = (Math.random() - 0.5) * 2;
          }
          room.send("drive", { seq: ++seq, throttle: 1, steer: yaw, handbrake: false });
          if (now - mountedAt > 6000) room.send("dismount", {});
        } else if (wantsVehicle && now - mountedAt > 8000) {
          let best: { id: string; d: number; x: number; z: number } | null = null;
          state.vehicles.forEach((v, id) => {
            if (v.driverId !== "") return;
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            if (!best || d < best.d) best = { id, d, x: v.x, z: v.z };
          });
          const target = best as { id: string; d: number; x: number; z: number } | null;
          if (target && target.d < 2.5) {
            room.send("mount", { vehicleId: target.id });
            mountedAt = now;
          } else if (target) {
            room.send("input", {
              seq: ++seq,
              moveX: 0,
              moveZ: 1,
              run: true,
              yaw: Math.atan2(target.x - me.x, target.z - me.z),
            });
          }
        } else {
          if (now >= nextTurn) {
            nextTurn = now + 1000 + Math.random() * 2500;
            yaw = Math.random() * Math.PI * 2;
          }
          room.send("input", { seq: ++seq, moveX: 0, moveZ: 1, run: Math.random() < 0.3, yaw });
        }
      }
      await sleep(50);
    }
    await room.leave().catch(() => {});
  })();
  return bot;
}

interface Histogram {
  buckets: { le: number; count: number }[];
  total: number;
}

async function readTickHistogram(ops: string): Promise<Histogram> {
  const text = await (await fetch(`${ops}/metrics`)).text();
  const buckets: { le: number; count: number }[] = [];
  for (const line of text.split("\n")) {
    const m = /^dnw_tick_duration_ms_bucket\{le="([^"]+)"\} (\d+)/.exec(line);
    if (m) buckets.push({ le: m[1] === "+Inf" ? Infinity : Number(m[1]), count: Number(m[2]) });
  }
  return { buckets, total: buckets[buckets.length - 1]?.count ?? 0 };
}

/** Phân vị gần đúng từ chênh lệch histogram tích lũy giữa hai thời điểm. */
function percentile(before: Histogram, after: Histogram, p: number): number {
  const total = after.total - before.total;
  if (total <= 0) return 0;
  const target = total * p;
  for (const b of after.buckets) {
    const prev = before.buckets.find((x) => x.le === b.le)?.count ?? 0;
    if (b.count - prev >= target) return b.le;
  }
  return Infinity;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Loadtest: ${args.clients} bot (${args.vehicleBots} lái xe), ${args.seconds}s, ${args.url}`,
  );

  const deadline = Date.now() + (args.seconds + 5) * 1000;
  const bots: Bot[] = [];
  for (let i = 0; i < args.clients; i++) {
    bots.push(await startBot(i, args, deadline));
    await sleep(40);
  }
  console.log(`Đã kết nối ${bots.length} bot, bắt đầu đo...`);

  const before = await readTickHistogram(args.ops);
  const bytes0 = bytesReceived;
  const t0 = Date.now();
  await sleep(args.seconds * 1000);
  const elapsed = (Date.now() - t0) / 1000;
  const after = await readTickHistogram(args.ops);
  const bytes = bytesReceived - bytes0;

  const kicked = bots.filter((b) => b.closeCode !== null).length;
  const perBotKBs = bytes / elapsed / args.clients / 1024;
  const p50 = percentile(before, after, 0.5);
  const p95 = percentile(before, after, 0.95);
  const ticks = after.total - before.total;

  console.log("--- Kết quả ---");
  console.log(
    `tick: ${ticks} lần (${(ticks / elapsed).toFixed(1)}/s), p50 <= ${p50} ms, p95 <= ${p95} ms (ngưỡng mục tiêu: p95 <= 10 ms)`,
  );
  console.log(
    `băng thông xuống: ${perBotKBs.toFixed(1)} KB/s mỗi bot (ngưỡng mục tiêu: <= 30 KB/s)`,
  );
  console.log(`bot bị ngắt: ${kicked}/${args.clients}`);
  const ok = p95 <= 10 && perBotKBs <= 30 && kicked === 0;
  console.log(ok ? "ĐẠT" : "KHÔNG ĐẠT");

  for (const b of bots) b.stop();
  await sleep(500);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
