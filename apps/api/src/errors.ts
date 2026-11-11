import type { ErrorCode } from "@dnw/schemas";

/** Lỗi nghiệp vụ có mã và HTTP status; error handler chuyển thành định dạng chuẩn ở mục 9.6. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message?: string,
    readonly details?: { path: string; issue: string }[],
  ) {
    super(message ?? code);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", 429, "Too many requests");
  }
}

export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", 401, "Authentication required"),
  invalidCredentials: () =>
    new AppError("AUTH_INVALID_CREDENTIALS", 401, "Invalid email or password"),
  emailNotVerified: () => new AppError("AUTH_EMAIL_NOT_VERIFIED", 401, "Email not verified"),
  suspended: () => new AppError("AUTH_ACCOUNT_SUSPENDED", 403, "Account suspended"),
  forbidden: () => new AppError("FORBIDDEN", 403, "Forbidden"),
  csrf: () => new AppError("CSRF_REJECTED", 403, "Request rejected"),
  notFound: () => new AppError("NOT_FOUND", 404, "Not found"),
  tokenInvalid: () => new AppError("TOKEN_INVALID", 400, "Token is invalid or expired"),
  rateLimited: () => new AppError("RATE_LIMITED", 429, "Too many requests"),
};
