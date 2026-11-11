import { join } from "node:path";
import {
  avatars,
  landmarkCategories,
  landmarkMedia,
  landmarks,
  landmarkTranslations,
  spawnPoints,
  vehicleSpawnPoints,
  vehicleTypes,
  worldZones,
  type Database,
} from "@dnw/db";
import { toLocal } from "@dnw/game-core";
import {
  characterManifestSchema,
  landmarkI18nSchema,
  landmarkManifestSchema,
  mediaManifestSchema,
  spawnPointsFileSchema,
  vehicleManifestSchema,
  vehicleSpawnsFileSchema,
  zoneManifestSchema,
} from "@dnw/schemas";
import { and, eq } from "drizzle-orm";
import type { Catalog, CatalogEntry } from "./build";
import { extractPolygons } from "./geo";
import { discover, exists, readJson } from "./paths";
import { validateContent } from "./validate";

export interface SyncResult {
  created: Record<string, number>;
  updated: Record<string, number>;
}

/** Hướng la bàn (0 = Bắc, 90 = Đông) sang `rotY` local (0 hướng +Z/Nam, mục 16.7). */
export function headingToRotY(headingDeg: number): number {
  const rad = Math.PI - (headingDeg * Math.PI) / 180;
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/** So sánh sâu, bỏ qua thứ tự khóa (jsonb sắp xếp lại khóa) và làm tròn float32 của cột `real`. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number")
    return a === b || Math.fround(a) === Math.fround(b);
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every(
        (k) => k in b && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    );
  }
  return a === b;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

class Counter {
  readonly created: Record<string, number> = {};
  readonly updated: Record<string, number> = {};
  created_(k: string) {
    this.created[k] = (this.created[k] ?? 0) + 1;
  }
  updated_(k: string) {
    this.updated[k] = (this.updated[k] ?? 0) + 1;
  }
}

/** Chỉ ghi các cột đổi giá trị để chạy lại không làm đổi `updated_at`. */
function changed<T extends Record<string, unknown>>(
  current: T,
  desired: Partial<T>,
): Partial<T> | null {
  const diff: Partial<T> = {};
  for (const [k, v] of Object.entries(desired))
    if (!same(current[k], v)) (diff as Record<string, unknown>)[k] = v;
  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Đồng bộ `content/` vào DB theo bảng sở hữu ở mục 16.4: mục mới tạo ở trạng thái tắt/draft,
 * mục cũ chỉ cập nhật phần Git sở hữu; `is_active`, bản dịch, trạng thái, media không bị ghi đè.
 */
export async function syncContent(
  db: Database,
  root: string,
  catalog: Catalog,
): Promise<SyncResult> {
  const issues = await validateContent(root);
  if (issues.length > 0)
    throw new Error(`Content không hợp lệ (${issues.length} lỗi); chạy content:validate`);
  const count = new Counter();
  const items = await discover(root);
  const entry = (kind: CatalogEntry["kind"], id: string) => {
    const e = catalog.items.find((i) => i.kind === kind && i.id === id);
    if (!e) throw new Error(`${kind} "${id}" chưa có trong catalog; chạy content:build`);
    return e;
  };

  await db.transaction(async (tx) => {
    const t = tx as unknown as Database;

    // ---- zone ----
    const zoneIds = new Map<string, { id: string; originLon: number; originLat: number }>();
    for (const item of items.filter((i) => i.kind === "zone")) {
      const m = zoneManifestSchema.parse(item.raw);
      const polygons = extractPolygons(await readJson(join(item.dir, m.boundary)));
      const boundary = {
        type: "MultiPolygon" as const,
        coordinates: polygons as [number, number][][][],
      };
      const [existing] = await t.select().from(worldZones).where(eq(worldZones.code, m.code));
      if (!existing) {
        const [row] = await t
          .insert(worldZones)
          .values({
            code: m.code,
            name: m.name,
            boundary,
            originLon: m.origin.lon,
            originLat: m.origin.lat,
            crs: m.crs,
            chunkSizeM: m.chunkSizeM,
            status: "draft",
          })
          .returning();
        count.created_("zone");
        zoneIds.set(m.code, { id: row!.id, originLon: m.origin.lon, originLat: m.origin.lat });
      } else {
        // Gốc tọa độ chỉ đổi được khi zone chưa từng publish bản đồ (mục 16.7).
        const desired = {
          name: m.name,
          boundary,
          crs: m.crs,
          chunkSizeM: m.chunkSizeM,
          ...(existing.mapVersion === 0
            ? { originLon: m.origin.lon, originLat: m.origin.lat }
            : {}),
        };
        const diff = changed(existing, desired);
        if (diff) {
          await t.update(worldZones).set(diff).where(eq(worldZones.id, existing.id));
          count.updated_("zone");
        }
        zoneIds.set(m.code, {
          id: existing.id,
          originLon: desired.originLon ?? existing.originLon,
          originLat: desired.originLat ?? existing.originLat,
        });
      }
    }

    // ---- loại xe ----
    const vehicleIds = new Map<string, string>();
    for (const item of items.filter((i) => i.kind === "vehicle")) {
      const m = vehicleManifestSchema.parse(item.raw);
      const e = entry("vehicle", m.id);
      const config = {
        handling: m.handling,
        dimensions: m.dimensions,
        surfaceSpeedFactor: m.surfaceSpeedFactor,
        seats: m.seats,
        nodes: m.nodes,
        ...(e.files.lod1 ? { lod1Key: e.files.lod1 } : {}),
      };
      const desired = {
        kind: m.kind,
        modelKey: e.files.model,
        thumbnailKey: e.files.thumbnail ?? null,
        config,
        contentVersion: m.version,
      };
      const [existing] = await t.select().from(vehicleTypes).where(eq(vehicleTypes.code, m.id));
      if (!existing) {
        const [row] = await t
          .insert(vehicleTypes)
          .values({ code: m.id, ...desired, isActive: false })
          .returning();
        vehicleIds.set(m.id, row!.id);
        count.created_("vehicle");
      } else {
        vehicleIds.set(m.id, existing.id);
        const diff = changed(existing, desired);
        if (diff) {
          await t.update(vehicleTypes).set(diff).where(eq(vehicleTypes.id, existing.id));
          count.updated_("vehicle");
        }
      }
    }

    // ---- nhân vật ----
    for (const item of items.filter((i) => i.kind === "character")) {
      const m = characterManifestSchema.parse(item.raw);
      const e = entry("character", m.id);
      const desired = {
        gender: m.gender,
        rig: m.rig,
        modelKey: e.files.model,
        thumbnailKey: e.files.thumbnail!,
        animationSet: m.rig,
        contentVersion: m.version,
      };
      const [existing] = await t.select().from(avatars).where(eq(avatars.code, m.id));
      if (!existing) {
        await t.insert(avatars).values({ code: m.id, ...desired, isActive: false });
        count.created_("character");
      } else {
        const diff = changed(existing, desired);
        if (diff) {
          await t.update(avatars).set(diff).where(eq(avatars.id, existing.id));
          count.updated_("character");
        }
      }
    }

    // ---- địa danh ----
    for (const item of items.filter((i) => i.kind === "landmark")) {
      const m = landmarkManifestSchema.parse(item.raw);
      const e = entry("landmark", m.code);
      const zone = zoneIds.get(m.zone);
      if (!zone) throw new Error(`landmark "${m.code}": zone "${m.zone}" chưa có trong DB`);
      const [category] = await t
        .select()
        .from(landmarkCategories)
        .where(eq(landmarkCategories.code, m.category));
      if (!category)
        throw new Error(
          `landmark "${m.code}": danh mục "${m.category}" chưa có trong DB (chạy db:seed)`,
        );

      let [row] = await t.select().from(landmarks).where(eq(landmarks.code, m.code));
      if (!row) {
        const local = toLocal(
          { lon: zone.originLon, lat: zone.originLat },
          m.location.lon,
          m.location.lat,
        );
        [row] = await t
          .insert(landmarks)
          .values({
            zoneId: zone.id,
            categoryId: category.id,
            code: m.code,
            location: { type: "Point", coordinates: [m.location.lon, m.location.lat] },
            localX: round(local.x),
            localZ: round(local.z),
            interactionRadiusM: m.interactionRadiusM,
            modelKey: e.files.model,
            coverImageKey: e.files.cover ?? null,
            status: "draft",
          })
          .returning();
        count.created_("landmark");

        const mediaPath = join(item.dir, "media", "media.json");
        if (await exists(mediaPath)) {
          const media = mediaManifestSchema.parse(await readJson(mediaPath));
          for (const [i, entryMedia] of media.items.entries()) {
            const key = e.files.media?.find((k) =>
              k.endsWith(`/${entryMedia.file.replace(/\.[^.]+$/, "")}.webp`),
            );
            if (!key) continue;
            await t.insert(landmarkMedia).values({
              landmarkId: row!.id,
              mediaType: "image",
              storageKey: key,
              altText: entryMedia.alt,
              copyrightCredit: entryMedia.copyrightCredit,
              license: entryMedia.license,
              sourceUrl: entryMedia.sourceUrl ?? null,
              sortOrder: i,
            });
          }
        }
      } else {
        const diff = changed(row, { modelKey: e.files.model });
        if (diff) {
          await t.update(landmarks).set(diff).where(eq(landmarks.id, row.id));
          count.updated_("landmark");
        }
      }

      for (const locale of ["vi", "en"] as const) {
        const path = join(item.dir, "i18n", `${locale}.json`);
        if (!(await exists(path))) continue;
        const [hasTranslation] = await t
          .select({ id: landmarkTranslations.id })
          .from(landmarkTranslations)
          .where(
            and(
              eq(landmarkTranslations.landmarkId, row!.id),
              eq(landmarkTranslations.locale, locale),
            ),
          );
        if (hasTranslation) continue;
        const text = landmarkI18nSchema.parse(await readJson(path));
        await t.insert(landmarkTranslations).values({
          landmarkId: row!.id,
          locale,
          name: text.name,
          shortDescription: text.shortDescription,
          description: text.description,
          addressText: text.addressText ?? null,
          historicalNote: text.historicalNote ?? null,
          reviewStatus: "draft",
        });
        count.created_("translation");
      }
    }

    // ---- điểm xuất hiện người chơi và điểm đậu xe ----
    for (const item of items.filter((i) => i.kind === "zone")) {
      const m = zoneManifestSchema.parse(item.raw);
      const zone = zoneIds.get(m.code)!;
      const origin = { lon: zone.originLon, lat: zone.originLat };

      const spFile = join(item.dir, "spawn_points.json");
      if (await exists(spFile)) {
        const existing = await t.select().from(spawnPoints).where(eq(spawnPoints.zoneId, zone.id));
        for (const s of spawnPointsFileSchema.parse(await readJson(spFile)).spawns) {
          const local = toLocal(origin, s.lon, s.lat);
          // Khớp theo lon/lat (không đổi khi gốc zone đổi); chỉ cập nhật tọa độ local nếu lệch.
          const found = existing.find(
            (r) =>
              Math.abs(r.position.coordinates[0] - s.lon) < 2e-7 &&
              Math.abs(r.position.coordinates[1] - s.lat) < 2e-7,
          );
          if (found) {
            const diff = changed(found, { localX: round(local.x), localZ: round(local.z) });
            if (diff) {
              await t.update(spawnPoints).set(diff).where(eq(spawnPoints.id, found.id));
              count.updated_("spawn");
            }
            continue;
          }
          await t.insert(spawnPoints).values({
            zoneId: zone.id,
            position: { type: "Point", coordinates: [s.lon, s.lat] },
            localX: round(local.x),
            localZ: round(local.z),
            rotationY: round(headingToRotY(s.headingDeg)),
          });
          count.created_("spawn");
        }
      }

      const vsFile = join(item.dir, "vehicle_spawns.json");
      if (await exists(vsFile)) {
        for (const s of vehicleSpawnsFileSchema.parse(await readJson(vsFile)).spawns) {
          const local = toLocal(origin, s.lon, s.lat);
          const desired = {
            vehicleTypeId: vehicleIds.get(s.vehicle)!,
            position: { type: "Point" as const, coordinates: [s.lon, s.lat] as [number, number] },
            localX: round(local.x),
            localZ: round(local.z),
            headingY: round(headingToRotY(s.headingDeg)),
            respawnSeconds: s.respawnSeconds,
          };
          const [existing] = await t
            .select()
            .from(vehicleSpawnPoints)
            .where(and(eq(vehicleSpawnPoints.zoneId, zone.id), eq(vehicleSpawnPoints.code, s.id)));
          if (!existing) {
            await t
              .insert(vehicleSpawnPoints)
              .values({ zoneId: zone.id, code: s.id, ...desired, isActive: true });
            count.created_("vehicle_spawn");
          } else {
            const diff = changed(existing, desired);
            if (diff) {
              await t
                .update(vehicleSpawnPoints)
                .set(diff)
                .where(eq(vehicleSpawnPoints.id, existing.id));
              count.updated_("vehicle_spawn");
            }
          }
        }
      }
    }
  });

  return { created: count.created, updated: count.updated };
}
