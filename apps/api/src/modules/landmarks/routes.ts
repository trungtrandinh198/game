import {
  errorResponseSchema,
  landmarkListSchema,
  landmarkSchema,
  zoneLandmarkListSchema,
  type LandmarkDto,
  type LandmarkMediaDto,
  type ZoneLandmarkDto,
} from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { and, eq, isNull } from "drizzle-orm";
import {
  landmarkMedia,
  landmarkTranslations,
  landmarks,
  worldZones,
} from "@dnw/db";
import { z } from "zod";
import type { AppContext } from "../../context";
import { cdnUrl } from "../../lib/cdn";
import { Errors } from "../../errors";

type Locale = "vi" | "en";

function resolveLocale(requested: string | undefined): { locale: Locale; fallback: Locale } {
  if (requested === "en" || requested === "vi") return { locale: requested, fallback: "vi" };
  return { locale: "vi", fallback: "vi" };
}

function toMediaDto(ctx: AppContext, row: typeof landmarkMedia.$inferSelect): LandmarkMediaDto {
  return {
    id: row.id,
    mediaType: row.mediaType as "image" | "video",
    url: cdnUrl(ctx.config.CDN_BASE_URL, row.storageKey),
    altText: row.altText,
    copyrightCredit: row.copyrightCredit,
    license: row.license,
    sourceUrl: row.sourceUrl,
  };
}

interface LandmarkRow {
  id: string;
  code: string;
  localX: number;
  localZ: number;
  interactionRadiusM: number;
  coverImageKey: string | null;
  name: string;
  shortDescription: string;
  description: string;
  addressText: string | null;
  historicalNote: string | null;
  localeUsed: Locale;
}

const SELECT_FIELDS = {
  id: landmarks.id,
  code: landmarks.code,
  localX: landmarks.localX,
  localZ: landmarks.localZ,
  interactionRadiusM: landmarks.interactionRadiusM,
  coverImageKey: landmarks.coverImageKey,
  name: landmarkTranslations.name,
  shortDescription: landmarkTranslations.shortDescription,
  description: landmarkTranslations.description,
  addressText: landmarkTranslations.addressText,
  historicalNote: landmarkTranslations.historicalNote,
} as const;

async function findPublishedLandmarks(
  ctx: AppContext,
  locale: Locale,
  fallback: Locale,
  zoneId?: string,
): Promise<LandmarkRow[]> {
  const db = ctx.db;
  const where = and(
    eq(landmarks.status, "published"),
    isNull(landmarks.deletedAt),
    zoneId ? eq(landmarks.zoneId, zoneId) : undefined,
  );

  const rows = await db
    .select(SELECT_FIELDS)
    .from(landmarks)
    .innerJoin(
      landmarkTranslations,
      and(eq(landmarkTranslations.landmarkId, landmarks.id), eq(landmarkTranslations.locale, locale)),
    )
    .where(where);

  if (rows.length > 0) return rows.map((r) => ({ ...r, localeUsed: locale }));

  if (locale !== fallback) {
    const fbRows = await db
      .select(SELECT_FIELDS)
      .from(landmarks)
      .innerJoin(
        landmarkTranslations,
        and(
          eq(landmarkTranslations.landmarkId, landmarks.id),
          eq(landmarkTranslations.locale, fallback),
        ),
      )
      .where(where);
    return fbRows.map((r) => ({ ...r, localeUsed: fallback }));
  }

  return [];
}

export const landmarkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/landmarks",
    {
      schema: {
        tags: ["landmarks"],
        summary: "Danh sách địa danh đã publish (công khai)",
        querystring: z.object({ locale: z.string().optional() }),
        response: { 200: landmarkListSchema },
      },
    },
    async (req, reply) => {
      reply.header("cache-control", "public, max-age=60");
      const { locale, fallback } = resolveLocale((req.query as Record<string, string>).locale);
      const rows = await findPublishedLandmarks(app.ctx, locale, fallback);
      const items: LandmarkDto[] = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        shortDescription: r.shortDescription,
        coverImageUrl: r.coverImageKey ? cdnUrl(app.ctx.config.CDN_BASE_URL, r.coverImageKey) : null,
        localeUsed: r.localeUsed,
      }));
      return { items };
    },
  );

  app.get(
    "/landmarks/:id",
    {
      schema: {
        tags: ["landmarks"],
        summary: "Chi tiết địa danh (công khai)",
        params: z.object({ id: z.string().min(1).max(100) }),
        querystring: z.object({ locale: z.string().optional() }),
        response: { 200: landmarkSchema, 404: errorResponseSchema },
      },
    },
    async (req, _reply) => {
      const { locale, fallback } = resolveLocale((req.query as Record<string, string>).locale);
      const rows = await findPublishedLandmarks(app.ctx, locale, fallback);
      const row = rows.find((r) => r.id === req.params.id || r.code === req.params.id);
      if (!row) throw Errors.notFound();

      const media = await app.ctx.db
        .select()
        .from(landmarkMedia)
        .where(eq(landmarkMedia.landmarkId, row.id))
        .orderBy(landmarkMedia.sortOrder);

      const dto: LandmarkDto = {
        id: row.id,
        code: row.code,
        name: row.name,
        shortDescription: row.shortDescription,
        description: row.description,
        addressText: row.addressText,
        historicalNote: row.historicalNote,
        coverImageUrl: row.coverImageKey ? cdnUrl(app.ctx.config.CDN_BASE_URL, row.coverImageKey) : null,
        media: media.map((m) => toMediaDto(app.ctx, m)),
        localeUsed: row.localeUsed,
      };
      return dto;
    },
  );

  app.get(
    "/world/zones/:code/landmarks",
    {
      schema: {
        tags: ["landmarks"],
        summary: "Địa danh trong zone (tọa độ local)",
        params: z.object({ code: z.string().min(2).max(80) }),
        querystring: z.object({ locale: z.string().optional() }),
        response: { 200: zoneLandmarkListSchema, 404: errorResponseSchema },
      },
    },
    async (req, reply) => {
      reply.header("cache-control", "public, max-age=60");
      const [zone] = await app.ctx.db
        .select({ id: worldZones.id })
        .from(worldZones)
        .where(eq(worldZones.code, req.params.code));
      if (!zone) throw Errors.notFound();

      const { locale, fallback } = resolveLocale((req.query as Record<string, string>).locale);
      const rows = await findPublishedLandmarks(app.ctx, locale, fallback, zone.id);
      const items: ZoneLandmarkDto[] = rows.map((r) => ({
        code: r.code,
        name: r.name,
        shortDescription: r.shortDescription,
        localX: r.localX,
        localZ: r.localZ,
        interactionRadiusM: r.interactionRadiusM,
        coverImageUrl: r.coverImageKey ? cdnUrl(app.ctx.config.CDN_BASE_URL, r.coverImageKey) : null,
        localeUsed: r.localeUsed,
      }));
      return { items };
    },
  );
};
