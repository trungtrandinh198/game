import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { mapChunks, worldZones, type Database } from "@dnw/db";
import { contentTypeFor, type ObjectStore } from "@dnw/content-cli/publish";
import { toGeo } from "@dnw/game-core";
import { eq } from "drizzle-orm";
import { loadIndex, zoneRoot } from "./build";

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";

export interface PublishMapOptions {
  outDir: string;
  zone: string;
  mapVersion: number;
  store: ObjectStore;
  db: Database;
}

export interface PublishMapResult {
  uploaded: number;
  skipped: number;
  chunkRows: number;
}

export class MapPublishError extends Error {}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  await walk(dir);
  return out.sort();
}

/**
 * Bước 11: chunk lên trước, rồi `map_chunks` + `world_zones.map_version` trong một transaction,
 * `index.json` ghi sau cùng để chuyển phiên bản nguyên tử. Bản cũ giữ nguyên nên client cũ vẫn chạy.
 */
export async function publishMap(opts: PublishMapOptions): Promise<PublishMapResult> {
  const root = zoneRoot(opts.outDir, opts.zone, opts.mapVersion);
  const index = await loadIndex(root);
  const prefix = `zones/${opts.zone}/v${opts.mapVersion}`;

  const [zone] = await opts.db.select().from(worldZones).where(eq(worldZones.code, opts.zone));
  if (!zone) throw new MapPublishError(`zone "${opts.zone}" chưa có trong DB; chạy content:sync`);
  if (opts.mapVersion <= zone.mapVersion) {
    throw new MapPublishError(
      `mapVersion ${opts.mapVersion} phải lớn hơn bản đang dùng (${zone.mapVersion})`,
    );
  }
  if (
    Math.abs(zone.originLon - index.origin.lon) > 1e-9 ||
    Math.abs(zone.originLat - index.origin.lat) > 1e-9
  ) {
    throw new MapPublishError(
      "origin của bản build khác origin trong DB; không được đổi origin sau khi publish (mục 16.7)",
    );
  }

  const result: PublishMapResult = { uploaded: 0, skipped: 0, chunkRows: 0 };
  for (const rel of (await listFiles(root)).filter((f) => f !== "index.json")) {
    const key = `${prefix}/${rel}`;
    if (await opts.store.exists(key)) {
      result.skipped++;
      continue;
    }
    await opts.store.put(key, await readFile(join(root, rel)), {
      contentType: contentTypeFor(key),
      cacheControl: IMMUTABLE,
    });
    result.uploaded++;
  }

  const origin = { lon: zone.originLon, lat: zone.originLat };
  await opts.db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    for (const c of index.chunks) {
      const minX = c.gx * index.chunkSizeM,
        minZ = c.gz * index.chunkSizeM;
      const corners = [
        [minX, minZ],
        [minX + index.chunkSizeM, minZ],
        [minX + index.chunkSizeM, minZ + index.chunkSizeM],
        [minX, minZ + index.chunkSizeM],
        [minX, minZ],
      ].map(([x, z]) => {
        const g = toGeo(origin, x!, z!);
        return [g.lon, g.lat] as [number, number];
      });
      await t.insert(mapChunks).values({
        zoneId: zone.id,
        chunkCode: c.code,
        gridX: c.gx,
        gridZ: c.gz,
        bounds: { type: "Polygon", coordinates: [corners] },
        assetManifestKey: `${prefix}/${c.manifest}`,
        collisionKey: `${prefix}/chunks/${c.code}/collision.json`,
        sizeBytes: c.sizeBytes,
        version: opts.mapVersion,
        status: "published",
      });
      result.chunkRows++;
    }
    await t
      .update(worldZones)
      .set({ mapVersion: opts.mapVersion })
      .where(eq(worldZones.id, zone.id));
  });

  await opts.store.put(`${prefix}/index.json`, await readFile(join(root, "index.json")), {
    contentType: "application/json",
    cacheControl: SHORT,
  });
  result.uploaded++;
  return result;
}
