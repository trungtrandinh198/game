"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError, api, errorMessageKey } from "./api-client";

export const ME_KEY = ["me"] as const;

/** Người dùng hiện tại; `null` khi chưa đăng nhập. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.code === "UNAUTHENTICATED") return null;
        throw e;
      }
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  const locale = useLocale();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      router.push(`/${locale}`);
    },
  });
}

/** Thông điệp lỗi đã dịch cho một lỗi bất kỳ. */
export function useErrorText() {
  const t = useTranslations();
  return (error: unknown) => t(errorMessageKey(error));
}

export type GuardMode = "auth" | "character" | "guest";

/** Chuyển trang theo trạng thái đăng nhập/nhân vật; trả `true` khi được phép hiển thị nội dung. */
export function useGuard(mode: GuardMode): boolean {
  const { data: me, isPending } = useMe();
  const router = useRouter();
  const locale = useLocale();

  const target = isPending
    ? null
    : mode === "guest"
      ? me
        ? me.hasCharacter
          ? `/${locale}/play`
          : `/${locale}/character`
        : null
      : !me
        ? `/${locale}/login`
        : mode === "character" && !me.hasCharacter
          ? `/${locale}/character`
          : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return !isPending && target === null;
}
