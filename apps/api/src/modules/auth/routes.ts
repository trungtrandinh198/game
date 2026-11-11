import {
  acceptedSchema,
  changePasswordBodySchema,
  emailBodySchema,
  errorResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  okSchema,
  registerBodySchema,
  resetPasswordBodySchema,
  tokenBodySchema,
  verificationSentSchema,
} from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { enforceRateLimits, LIMITS } from "../../lib/rate-limit";
import { requireAuth } from "../../plugins/auth";
import * as service from "./service";

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
};

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const meta = (req: {
    ip: string;
    headers: { "user-agent"?: string | undefined };
    log: service.RequestMeta["log"];
  }) => ({
    ip: req.ip,
    userAgent: req.headers["user-agent"] ?? null,
    log: req.log,
  });

  app.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        summary: "Đăng ký (luôn 202, không lộ email đã tồn tại)",
        body: registerBodySchema,
        response: { 202: verificationSentSchema, ...errors },
      },
    },
    async (req, reply) => {
      await enforceRateLimits(app.ctx, [
        { name: "register:ip", key: req.ip, ...LIMITS.registerPerIp },
      ]);
      await service.register(app.ctx, req.body, meta(req));
      return reply.status(202).send({ status: "verification_sent" as const });
    },
  );

  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Đăng nhập, đặt cookie phiên",
        body: loginBodySchema,
        response: { 200: loginResponseSchema, ...errors },
      },
    },
    async (req, reply) => {
      await enforceRateLimits(app.ctx, [
        { name: "login:ip-email", key: `${req.ip}|${req.body.email}`, ...LIMITS.loginPerIpEmail },
        { name: "login:ip", key: req.ip, ...LIMITS.loginPerIp },
      ]);
      const { token, maxAgeSeconds, user } = await service.login(app.ctx, req.body, meta(req));
      reply.setCookie(app.ctx.config.SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: app.ctx.config.cookieSecure,
        sameSite: "lax",
        path: "/",
        maxAge: maxAgeSeconds,
      });
      return { user };
    },
  );

  app.post(
    "/auth/logout",
    { schema: { tags: ["auth"], summary: "Đăng xuất", response: { 204: z.null(), ...errors } } },
    async (req, reply) => {
      if (req.auth) await service.logout(app.ctx, req.auth.sessionId);
      reply.clearCookie(app.ctx.config.SESSION_COOKIE_NAME, { path: "/" });
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/auth/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Người dùng hiện tại",
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
      },
    },
    async (req) => ({ user: await service.me(app.ctx, requireAuth(req).userId) }),
  );

  app.post(
    "/auth/verify-email",
    {
      schema: {
        tags: ["auth"],
        summary: "Xác minh email bằng token một lần",
        body: tokenBodySchema,
        response: { 200: okSchema, ...errors },
      },
    },
    async (req) => {
      await service.verifyEmail(app.ctx, req.body.token);
      return { status: "ok" as const };
    },
  );

  app.post(
    "/auth/resend-verification",
    {
      schema: {
        tags: ["auth"],
        summary: "Gửi lại email xác minh (luôn 202)",
        body: emailBodySchema,
        response: { 202: acceptedSchema, ...errors },
      },
    },
    async (req, reply) => {
      await enforceRateLimits(app.ctx, [
        { name: "mail:ip", key: req.ip, ...LIMITS.mailPerIp },
        { name: "mail:email", key: req.body.email, ...LIMITS.mailPerEmail },
      ]);
      await service.resendVerification(app.ctx, req.body.email, meta(req));
      return reply.status(202).send({ status: "accepted" as const });
    },
  );

  app.post(
    "/auth/forgot-password",
    {
      schema: {
        tags: ["auth"],
        summary: "Yêu cầu đặt lại mật khẩu (luôn 202)",
        body: emailBodySchema,
        response: { 202: acceptedSchema, ...errors },
      },
    },
    async (req, reply) => {
      await enforceRateLimits(app.ctx, [
        { name: "mail:ip", key: req.ip, ...LIMITS.mailPerIp },
        { name: "mail:email", key: req.body.email, ...LIMITS.mailPerEmail },
      ]);
      await service.forgotPassword(app.ctx, req.body.email, meta(req));
      return reply.status(202).send({ status: "accepted" as const });
    },
  );

  app.post(
    "/auth/reset-password",
    {
      schema: {
        tags: ["auth"],
        summary: "Đặt mật khẩu mới; thu hồi mọi phiên",
        body: resetPasswordBodySchema,
        response: { 200: okSchema, ...errors },
      },
    },
    async (req) => {
      await service.resetPassword(app.ctx, req.body.token, req.body.password);
      return { status: "ok" as const };
    },
  );

  app.post(
    "/auth/change-password",
    {
      schema: {
        tags: ["auth"],
        summary: "Đổi mật khẩu; thu hồi các phiên khác",
        body: changePasswordBodySchema,
        response: { 200: okSchema, ...errors },
      },
    },
    async (req) => {
      const auth = requireAuth(req);
      await service.changePassword(app.ctx, auth, req.body);
      return { status: "ok" as const };
    },
  );
};
