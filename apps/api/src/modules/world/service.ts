import type { JoinResponse } from "@dnw/schemas";
import type { AppContext, AuthContext } from "../../context";
import { AppError, Errors } from "../../errors";
import { DEV_TICKET_SECRET, signJoinTicket } from "../../lib/ticket";
import { hasCharacter } from "../auth/repo";
import * as repo from "./repo";

/** `POST /world/join` (mục 9.8): điều kiện vào thế giới rồi cấp ticket 60 giây cho realtime. */
export async function join(ctx: AppContext, auth: AuthContext, zoneCode: string): Promise<JoinResponse> {
  if (auth.status === "suspended" || auth.status === "banned") throw Errors.suspended();
  if (auth.status !== "active" || (ctx.config.REQUIRE_EMAIL_VERIFICATION && !auth.emailVerified)) {
    throw Errors.emailNotVerified();
  }
  if (!(await hasCharacter(ctx.db, auth.userId))) {
    throw new AppError("CHARACTER_REQUIRED", 412, "Character required");
  }
  const zone = await repo.findOpenZone(ctx.db, zoneCode);
  if (!zone) throw new AppError("ZONE_UNAVAILABLE", 412, "Zone unavailable");

  const secret = ctx.config.REALTIME_TICKET_SECRET ?? DEV_TICKET_SECRET;
  const ticket = await signJoinTicket(secret, {
    userId: auth.userId,
    zoneCode: zone.code,
    protocolVersion: ctx.config.PROTOCOL_VERSION,
  });
  return {
    ticket,
    realtimeUrl: ctx.config.REALTIME_PUBLIC_URL ?? "ws://localhost:2567",
    roomName: "city",
    zoneCode: zone.code,
    protocolVersion: ctx.config.PROTOCOL_VERSION,
  };
}
