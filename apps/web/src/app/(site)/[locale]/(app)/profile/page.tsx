"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { profileForm } from "@/lib/forms";
import { ME_KEY, useErrorText, useGuard } from "@/lib/hooks";
import { useSettings } from "@/lib/settings-store";

interface ProfileValues {
  displayName: string;
  locale: "vi" | "en";
  countryCode: string;
  bio: string;
}

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const allowed = useGuard("auth");
  const settings = useSettings();
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile, enabled: allowed });
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileForm),
    defaultValues: { displayName: "", locale: "vi", countryCode: "", bio: "" },
  });

  useEffect(() => {
    if (profile.data) {
      form.reset({
        displayName: profile.data.displayName,
        locale: profile.data.locale,
        countryCode: profile.data.countryCode ?? "",
        bio: profile.data.bio ?? "",
      });
    }
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: (v: ProfileValues) =>
      api.updateProfile({
        displayName: v.displayName,
        locale: v.locale,
        countryCode: v.countryCode ? v.countryCode.toUpperCase() : null,
        bio: v.bio.trim() || null,
      }),
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      qc.setQueryData(["profile"], updated);
      if (updated.locale !== locale) {
        document.cookie = `dnw_locale=${updated.locale}; path=/; max-age=31536000; samesite=lax`;
        router.replace(`/${updated.locale}/profile`);
      }
    },
  });
  const { errors } = form.formState;
  const msg = (key?: string) => (key ? t(key) : undefined);

  if (!allowed)
    return (
      <Page>
        <p>{t("common.loading")}</p>
      </Page>
    );

  return (
    <Page>
      <h1 className="mb-4 text-2xl font-semibold">{t("profile.title")}</h1>
      <Card className="mb-4">
        <h2 className="mb-3 text-lg font-medium">{t("profile.account")}</h2>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4" noValidate>
          {save.error && <Alert>{errorText(save.error)}</Alert>}
          {save.isSuccess && <Alert kind="ok">{t("common.saved")}</Alert>}
          <Field
            id="displayName"
            label={t("auth.displayName")}
            error={msg(errors.displayName?.message)}
          >
            <Input
              id="displayName"
              aria-invalid={!!errors.displayName}
              aria-describedby="displayName-error"
              {...form.register("displayName")}
            />
          </Field>
          <Field id="locale" label={t("common.language")}>
            <select
              id="locale"
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"
              {...form.register("locale")}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field
            id="countryCode"
            label={t("profile.country")}
            error={msg(errors.countryCode?.message)}
          >
            <Input
              id="countryCode"
              maxLength={2}
              aria-describedby="countryCode-error"
              {...form.register("countryCode")}
            />
          </Field>
          <Field id="bio" label={t("profile.bio")} error={msg(errors.bio?.message)}>
            <Input
              id="bio"
              maxLength={160}
              aria-describedby="bio-error"
              {...form.register("bio")}
            />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-medium">{t("profile.game")}</h2>
        <div className="grid gap-4">
          <Field
            id="sensitivity"
            label={`${t("profile.sensitivity")}: ${settings.cameraSensitivity.toFixed(1)}`}
          >
            <input
              id="sensitivity"
              type="range"
              min={0.3}
              max={2}
              step={0.1}
              value={settings.cameraSensitivity}
              onChange={(e) => settings.set({ cameraSensitivity: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={settings.invertY}
              onChange={(e) => settings.set({ invertY: e.target.checked })}
            />
            {t("profile.invertY")}
          </label>
        </div>
      </Card>
    </Page>
  );
}
