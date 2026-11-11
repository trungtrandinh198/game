import { errorResponseSchema, type ErrorCode } from "@dnw/schemas";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { AppError, RateLimitedError } from "../errors";

type Details = { path: string; issue: string }[];

function body(code: ErrorCode, message: string, requestId: string, details?: Details) {
  return errorResponseSchema.parse({
    error: { code, message, requestId, ...(details ? { details } : {}) },
  });
}

/** Mọi lỗi trả về cùng một định dạng (mục 9.6); lỗi lạ chỉ trả thông điệp chung. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send(body("NOT_FOUND", "Not found", req.id)),
  );

  app.setErrorHandler((error: FastifyError | AppError, req, reply) => {
    if (error instanceof AppError) {
      if (error instanceof RateLimitedError)
        reply.header("retry-after", String(error.retryAfterSeconds));
      return reply
        .status(error.status)
        .send(body(error.code, error.message, req.id, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: Details = error.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, "").replace(/\//g, "."),
        issue: v.message ?? "invalid",
      }));
      return reply.status(400).send(body("VALIDATION_ERROR", "Invalid input", req.id, details));
    }

    const fastifyCode = (error as FastifyError).code;
    if (fastifyCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.status(413).send(body("PAYLOAD_TOO_LARGE", "Payload too large", req.id));
    }
    if (
      fastifyCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
      fastifyCode === "FST_ERR_CTP_INVALID_CONTENT_LENGTH" ||
      fastifyCode === "FST_ERR_CTP_EMPTY_JSON_BODY" ||
      (error as FastifyError).statusCode === 400
    ) {
      return reply.status(400).send(body("VALIDATION_ERROR", "Invalid request", req.id));
    }

    req.log.error(
      { err: { type: error.name, message: error.message, stack: error.stack } },
      "unhandled_error",
    );
    return reply.status(500).send(body("INTERNAL_ERROR", "Internal server error", req.id));
  });
}
