import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createDb, createPool } from "@dnw/db";
import { CLOSE_CODES, MAX_PAYLOAD_BYTES } from "@dnw/game-config";
import { SANDBOX_ZONE_CODE } from "@dnw/game-core";
import { Redis } from "ioredis";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import type { RealtimeConfig } from "./config";
import { createMetrics, type Metrics } from "./metrics";
import { createOpsServer } from "./ops";
import { CityRoom, setRoomDeps, type LocalClient } from "./rooms/CityRoom";
import { DbDirectory, DevDirectory, type PlayerDirectory } from "./services/directory";
import { MemoryPresence, RedisPresence, type Presence } from "./services/presence";
import { RoutedDirectory } from "./services/routed";
import {
  CompositeZoneProvider,
  DbZoneProvider,
  SandboxZoneProvider,
  createMapSource,
  type ZoneProvider,
} from "./services/zone";

export interface GameServer {
  config: RealtimeConfig;
  metrics: Metrics;
  presence: Presence;
  /** Cổng thực tế sau khi start (hữu ích khi cấu hình cổng 0). */
  ports: () => { realtime: number; ops: number };
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface GameServerOverrides {
  zones?: ZoneProvider;
  directory?: PlayerDirectory;
  presence?: Presence;
}

export function createGameServer(
  config: RealtimeConfig,
  overrides: GameServerOverrides = {},
): GameServer {
  const metrics = createMetrics();
  const cleanups: (() => Promise<unknown>)[] = [];

  let zones = overrides.zones;
  let directory = overrides.directory;
  if (!zones || !directory) {
    const providers: ZoneProvider[] = [];
    // Zone sandbox cục bộ chỉ có khi cho phép ticket dev (ngoài production).
    if (config.allowDevTickets) providers.push(new SandboxZoneProvider());
    let real: PlayerDirectory = new DevDirectory();
    if (config.databaseUrl) {
      const pool = createPool(config.databaseUrl);
      cleanups.push(() => pool.end());
      const db = createDb(pool);
      if (config.mapSource) providers.push(new DbZoneProvider(db, createMapSource(config.mapSource)));
      real = new DbDirectory(db);
    }
    zones ??= new CompositeZoneProvider(providers);
    directory ??= new RoutedDirectory(new DevDirectory(), real);
  }

  let presence = overrides.presence;
  if (!presence) {
    presence = config.redisUrl
      ? new RedisPresence(new Redis(config.redisUrl, { maxRetriesPerRequest: 2 }))
      : new MemoryPresence();
  }
  const presenceRef = presence;
  cleanups.push(() => presenceRef.close());

  const localClients = new Map<string, LocalClient>();
  presence.onSupersede((_userId, sessionId) => {
    localClients.get(sessionId)?.client.leave(CLOSE_CODES.DUPLICATE_SESSION);
  });
  presence.onModeration((event) => {
    const code = event.type === "kick" ? CLOSE_CODES.KICKED : CLOSE_CODES.BANNED;
    for (const local of localClients.values()) {
      if (local.userId === event.userId) local.client.leave(code);
    }
  });

  setRoomDeps({ config, metrics, zones: zones!, directory: directory!, presence, localClients });

  const transport = new WebSocketTransport({
    maxPayload: MAX_PAYLOAD_BYTES,
    pingInterval: 3000,
    pingMaxRetries: 3,
  });
  const server = new Server({ transport, greet: false, gracefullyShutdown: false });
  server.define("city", CityRoom).filterBy(["zoneCode"]);

  let ready = false;
  const ops: http.Server = createOpsServer({
    config,
    metrics,
    zoneCode: SANDBOX_ZONE_CODE,
    isReady: () => ready,
  });

  const portOf = (srv: { address(): string | AddressInfo | null } | undefined): number => {
    const address = srv?.address();
    return typeof address === "object" && address ? address.port : 0;
  };

  return {
    config,
    metrics,
    presence,
    ports: () => ({
      realtime: portOf((transport as unknown as { server?: http.Server }).server),
      ops: portOf(ops),
    }),
    async start() {
      await server.listen(config.port);
      await new Promise<void>((resolve) => ops.listen(config.opsPort, config.opsHost, resolve));
      ready = true;
    },
    async stop() {
      ready = false;
      await server.gracefullyShutdown(false);
      await new Promise<void>((resolve) => ops.close(() => resolve()));
      await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
    },
  };
}
