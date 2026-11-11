"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { ME_KEY, useErrorText, useGuard, useMe } from "@/lib/hooks";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

export default function CharacterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const allowed = useGuard("auth");
  const { data: me } = useMe();

  const avatars = useQuery({ queryKey: ["avatars"], queryFn: api.avatars, enabled: allowed });
  const characters = useQuery({
    queryKey: ["characters"],
    queryFn: api.characters,
    enabled: allowed,
  });
  const current = characters.data?.[0];

  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLORS[3]!);

  useEffect(() => {
    if (current) {
      setAvatarId(current.avatarId);
      setName(current.characterName ?? "");
      setColor(current.appearanceConfig.outfitColor ?? COLORS[3]!);
    }
  }, [current]);

  const save = useMutation({
    mutationFn: async () => {
      const appearanceConfig = { outfitColor: color };
      const characterName = name.trim() || undefined;
      if (current) {
        return api.updateCharacter(current.id, {
          avatarId: avatarId!,
          characterName: characterName ?? null,
          appearanceConfig,
        });
      }
      return api.createCharacter({
        avatarId: avatarId!,
        ...(characterName ? { characterName } : {}),
        appearanceConfig,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["characters"] });
      await qc.invalidateQueries({ queryKey: ME_KEY });
      router.push(`/${locale}/play`);
    },
  });

  if (!allowed)
    return (
      <Page>
        <p>{t("common.loading")}</p>
      </Page>
    );

  return (
    <Page narrow={false}>
      <h1 className="mb-1 text-2xl font-semibold">{t("character.title")}</h1>
      <p className="mb-4 text-[var(--muted)]">
        {t("character.subtitle")}
        {me ? ` — ${me.displayName}` : ""}
      </p>
      {save.error && <Alert>{errorText(save.error)}</Alert>}
      {avatars.data?.length === 0 && <Alert>{t("character.empty")}</Alert>}
      <ul
        className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        role="radiogroup"
        aria-label={t("character.title")}
      >
        {avatars.data?.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              role="radio"
              aria-checked={avatarId === a.id}
              data-testid={`avatar-${a.code}`}
              onClick={() => setAvatarId(a.id)}
              className={`w-full rounded-xl border p-3 text-center ${avatarId === a.id ? "border-sky-400 bg-sky-400/10" : "border-[var(--border)] bg-[var(--panel)]"}`}
            >
              {/* Thumbnail do CDN; khi chưa có CDN thì ảnh lỗi và chỉ còn nhãn */}
              <img
                src={a.thumbnailUrl}
                alt=""
                width={96}
                height={96}
                className="mx-auto mb-2 size-24 rounded-lg bg-slate-700 object-cover"
              />
              <span className="block font-medium">{a.code}</span>
              <span className="text-sm text-[var(--muted)]">
                {a.gender === "male" ? t("character.male") : t("character.female")}
              </span>
              {current?.avatarId === a.id && (
                <span className="block text-xs text-sky-300">{t("character.selected")}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Card className="grid max-w-md gap-4">
        <Field id="characterName" label={t("character.name")}>
          <Input
            id="characterName"
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="text-sm text-[var(--muted)]">{t("character.color")}</legend>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`size-9 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              />
            ))}
          </div>
        </fieldset>
        <Button
          disabled={!avatarId || save.isPending}
          onClick={() => save.mutate()}
          data-testid="save-character"
        >
          {t("character.save")}
        </Button>
      </Card>
    </Page>
  );
}
