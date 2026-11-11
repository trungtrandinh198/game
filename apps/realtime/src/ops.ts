import { randomUUID } from "node:crypto";
import http from "node:http";
import type { RealtimeConfig } from "./config";
import type { Metrics } from "./metrics";
import { signTicket } from "./services/ticket";

export interface OpsOptions {
  config: RealtimeConfig;
  metrics: Metrics;
  zoneCode: string;
  isReady: () => boolean;
}

/** Cổng vận hành nội bộ: /healthz, /readyz, /metrics và (chỉ dev) /dev/ticket. Không để lộ ra Internet. */
export function createOpsServer({ config, metrics, zoneCode, isReady }: OpsOptions): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain" }).end("ok");
        return;
      }
      if (req.method === "GET" && url.pathname === "/readyz") {
        res
          .writeHead(isReady() ? 200 : 503, { "content-type": "text/plain" })
          .end(isReady() ? "ready" : "starting");
        return;
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        res
          .writeHead(200, { "content-type": metrics.registry.contentType })
          .end(await metrics.registry.metrics());
        return;
      }
      if (req.method === "GET" && url.pathname === "/dev/ticket" && config.allowDevTickets) {
        const name = (url.searchParams.get("name") ?? "").slice(0, 32) || undefined;
        const userId = (url.searchParams.get("user") ?? "").slice(0, 64) || randomUUID();
        const ticket = await signTicket(config.ticketSecret, {
          userId,
          zoneCode,
          protocolVersion: config.protocolVersion,
          ...(name ? { displayName: name } : {}),
        });
        res
          .writeHead(200, {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          })
          .end(
            JSON.stringify({
              ticket,
              realtimeUrl: config.publicUrl,
              zoneCode,
              protocolVersion: config.protocolVersion,
            }),
          );
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    } catch {
      res.writeHead(500, { "content-type": "text/plain" }).end("internal error");
    }
  });
}
