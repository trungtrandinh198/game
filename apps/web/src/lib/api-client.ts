import {
  avatarSchema,
  characterSchema,
  joinResponseSchema,
  loginResponseSchema,
  profileSchema,
  zoneListSchema,
  type AvatarDto,
  type CharacterDto,
  type CurrentUser,
  type ErrorCode,
  type JoinResponse,
  type Profile,
  type ZoneDto,
} from "@dnw/schemas";
import { z } from "zod";

/** Lỗi API theo định dạng chuẩn ở mục 9.6, hoặc `NETWORK` khi không kết nối được. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK",
    readonly status: number,
    readonly details: { path: string; issue: string }[] = [],
    readonly requestId?: string,
  ) {
    super(code);
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface RequestOptions {
  method?: string;
  body?: unknown;
  fetchFn?: typeof fetch;
}

/** Gọi API cùng origin (Next chuyển tiếp `/api/v1`); tự gắn `X-DNW-CSRF` cho thao tác ghi. */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T> | null,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (UNSAFE.has(method)) headers["x-dnw-csrf"] = "1";
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await (options.fetchFn ?? fetch)(`/api/v1${path}`, {
      method,
      headers,
      credentials: "same-origin",
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError("NETWORK", 0);
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => null);
    const error = (
      parsed as {
        error?: {
          code?: ErrorCode;
          details?: { path: string; issue: string }[];
          requestId?: string;
        };
      } | null
    )?.error;
    throw new ApiError(
      error?.code ?? "INTERNAL_ERROR",
      res.status,
      error?.details,
      error?.requestId,
    );
  }
  if (res.status === 204 || schema === null) return undefined as T;
  return schema.parse(await res.json());
}

const status = z.object({ status: z.string() });

export const api = {
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    locale: "vi" | "en";
    acceptTerms: true;
  }) => apiRequest("/auth/register", status, { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    apiRequest("/auth/login", loginResponseSchema, { method: "POST", body }).then((r) => r.user),
  logout: () => apiRequest("/auth/logout", null, { method: "POST" }),
  me: (): Promise<CurrentUser> => apiRequest("/auth/me", loginResponseSchema).then((r) => r.user),
  verifyEmail: (token: string) =>
    apiRequest("/auth/verify-email", status, { method: "POST", body: { token } }),
  resendVerification: (email: string) =>
    apiRequest("/auth/resend-verification", status, { method: "POST", body: { email } }),
  forgotPassword: (email: string) =>
    apiRequest("/auth/forgot-password", status, { method: "POST", body: { email } }),
  resetPassword: (token: string, password: string) =>
    apiRequest("/auth/reset-password", status, { method: "POST", body: { token, password } }),

  profile: (): Promise<Profile> => apiRequest("/player/profile", profileSchema),
  updateProfile: (
    body: Partial<{
      displayName: string;
      locale: "vi" | "en";
      countryCode: string | null;
      bio: string | null;
    }>,
  ): Promise<Profile> => apiRequest("/player/profile", profileSchema, { method: "PATCH", body }),

  avatars: (): Promise<AvatarDto[]> =>
    apiRequest("/avatars", z.object({ items: z.array(avatarSchema) })).then((r) => r.items),
  characters: (): Promise<CharacterDto[]> =>
    apiRequest("/player/characters", z.object({ items: z.array(characterSchema) })).then(
      (r) => r.items,
    ),
  createCharacter: (body: {
    avatarId: string;
    characterName?: string;
    appearanceConfig?: Record<string, string>;
  }): Promise<CharacterDto> =>
    apiRequest("/player/characters", characterSchema, { method: "POST", body }),
  updateCharacter: (
    id: string,
    body: {
      avatarId?: string;
      characterName?: string | null;
      appearanceConfig?: Record<string, string>;
    },
  ): Promise<CharacterDto> =>
    apiRequest(`/player/characters/${id}`, characterSchema, { method: "PATCH", body }),

  zones: (): Promise<ZoneDto[]> => apiRequest("/world/zones", zoneListSchema).then((r) => r.items),
  join: (zoneCode: string): Promise<JoinResponse> =>
    apiRequest("/world/join", joinResponseSchema, { method: "POST", body: { zoneCode } }),
};

/** Khóa chuỗi i18n (`errors.<CODE>`) cho một lỗi bất kỳ. */
export function errorMessageKey(error: unknown): string {
  return error instanceof ApiError ? `errors.${error.code}` : "errors.INTERNAL_ERROR";
}
