import { Redis } from "ioredis";

export interface SessionRef {
  roomId: string;
  sessionId: string;
}

export interface ModerationEvent {
  type: "kick" | "ban" | "suspend";
  userId: string;
  reason?: string;
}

export interface Presence {
  /** `SET ticket:{jti} NX EX 60`: true nếu jti chưa từng dùng. */
  consumeTicket(jti: string): Promise<boolean>;
  /** Ghi phiên mới của user; trả phiên cũ (nếu có) và thông báo cho mọi tiến trình để đóng phiên cũ (mã 4013). */
  claim(userId: string, session: SessionRef): Promise<SessionRef | null>;
  release(userId: string, sessionId: string): Promise<void>;
  onSupersede(handler: (userId: string, sessionId: string) => void): void;
  onModeration(handler: (event: ModerationEvent) => void): void;
  /** Dùng cho API/admin: phát sự kiện kick/ban tới mọi realtime. */
  publishModeration(event: ModerationEvent): Promise<void>;
  close(): Promise<void>;
}

const TICKET_TTL_S = 60;
const PRESENCE_TTL_S = 24 * 3600;
export const MODERATION_CHANNEL = "dnw:moderation";
export const SUPERSEDE_CHANNEL = "dnw:presence";

/** Dùng cho dev/test một tiến trình; thay bằng RedisPresence khi chạy nhiều tiến trình. */
export class MemoryPresence implements Presence {
  private readonly tickets = new Map<string, number>();
  private readonly sessions = new Map<string, SessionRef>();
  private readonly supersede: ((userId: string, sessionId: string) => void)[] = [];
  private readonly moderation: ((event: ModerationEvent) => void)[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  async consumeTicket(jti: string) {
    const t = this.now();
    for (const [id, expires] of this.tickets) if (expires <= t) this.tickets.delete(id);
    if (this.tickets.has(jti)) return false;
    this.tickets.set(jti, t + TICKET_TTL_S * 1000);
    return true;
  }

  async claim(userId: string, session: SessionRef) {
    const previous = this.sessions.get(userId) ?? null;
    this.sessions.set(userId, session);
    if (previous && previous.sessionId !== session.sessionId) {
      for (const h of this.supersede) h(userId, previous.sessionId);
    }
    return previous;
  }

  async release(userId: string, sessionId: string) {
    if (this.sessions.get(userId)?.sessionId === sessionId) this.sessions.delete(userId);
  }

  onSupersede(handler: (userId: string, sessionId: string) => void) {
    this.supersede.push(handler);
  }

  onModeration(handler: (event: ModerationEvent) => void) {
    this.moderation.push(handler);
  }

  async publishModeration(event: ModerationEvent) {
    for (const h of this.moderation) h(event);
  }

  async close() {}
}

export class RedisPresence implements Presence {
  private readonly supersede: ((userId: string, sessionId: string) => void)[] = [];
  private readonly moderation: ((event: ModerationEvent) => void)[] = [];
  private subscribed = false;

  constructor(
    private readonly redis: Redis,
    private readonly sub: Redis = redis.duplicate(),
  ) {
    for (const r of [redis, sub]) r.on("error", () => undefined);
  }

  private async ensureSubscribed() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.sub.on("message", (channel, message) => {
      try {
        const data = JSON.parse(message) as Record<string, unknown>;
        if (channel === SUPERSEDE_CHANNEL && typeof data["userId"] === "string" && typeof data["sessionId"] === "string") {
          for (const h of this.supersede) h(data["userId"], data["sessionId"]);
        } else if (channel === MODERATION_CHANNEL && typeof data["userId"] === "string") {
          for (const h of this.moderation) h(data as unknown as ModerationEvent);
        }
      } catch {
        // thông điệp hỏng bị bỏ qua
      }
    });
    await this.sub.subscribe(SUPERSEDE_CHANNEL, MODERATION_CHANNEL);
  }

  async consumeTicket(jti: string) {
    return (await this.redis.set(`ticket:${jti}`, "1", "EX", TICKET_TTL_S, "NX")) === "OK";
  }

  async claim(userId: string, session: SessionRef) {
    await this.ensureSubscribed();
    const raw = await this.redis.set(`presence:user:${userId}`, JSON.stringify(session), "EX", PRESENCE_TTL_S, "GET");
    const previous = raw ? (JSON.parse(raw) as SessionRef) : null;
    if (previous && previous.sessionId !== session.sessionId) {
      await this.redis.publish(SUPERSEDE_CHANNEL, JSON.stringify({ userId, sessionId: previous.sessionId }));
    }
    return previous;
  }

  async release(userId: string, sessionId: string) {
    const key = `presence:user:${userId}`;
    const raw = await this.redis.get(key);
    if (raw && (JSON.parse(raw) as SessionRef).sessionId === sessionId) await this.redis.del(key);
  }

  onSupersede(handler: (userId: string, sessionId: string) => void) {
    this.supersede.push(handler);
    void this.ensureSubscribed();
  }

  onModeration(handler: (event: ModerationEvent) => void) {
    this.moderation.push(handler);
    void this.ensureSubscribed();
  }

  async publishModeration(event: ModerationEvent) {
    await this.redis.publish(MODERATION_CHANNEL, JSON.stringify(event));
  }

  async close() {
    this.redis.disconnect();
    this.sub.disconnect();
  }
}
