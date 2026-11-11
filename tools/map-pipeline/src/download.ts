import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson } from "@dnw/content-cli/paths";
import { zoneManifestSchema } from "@dnw/schemas";

export const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const USER_AGENT = "Mozilla/5.0 (compatible; danang-world-map-pipeline/0.1; +https://github.com/)";

export function overpassQuery(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:180];
(
  way["building"](${b}); relation["building"](${b});
  way["highway"](${b});
  way["natural"="water"](${b}); relation["natural"="water"](${b});
  way["waterway"="riverbank"](${b}); relation["waterway"="riverbank"](${b});
  way["leisure"~"^(park|garden)$"](${b});
  node["natural"="tree"](${b});
);
(._;>;);
out body qt;`;
}

interface Geo {
  type: string;
  coordinates?: unknown;
  geometry?: Geo;
  features?: Geo[];
}

export function boundaryBBox(
  geo: Geo,
  marginM = 30,
): { south: number; west: number; north: number; east: number } {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      west = Math.min(west, c[0]);
      east = Math.max(east, c[0]);
      south = Math.min(south, c[1] as number);
      north = Math.max(north, c[1] as number);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  const visit = (g: Geo | undefined): void => {
    if (!g) return;
    if (g.coordinates) walk(g.coordinates);
    visit(g.geometry);
    g.features?.forEach(visit);
  };
  visit(geo);
  const dLat = marginM / 110_540;
  const dLon = marginM / (111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  return { south: south - dLat, west: west - dLon, north: north + dLat, east: east + dLon };
}

/** Tải OSM bằng Overpass (chạy tay một lần, không chạy trong CI) rồi ghi `raw/<zone>.osm.json` và `.meta.json`. */
export async function downloadOsm(
  contentRoot: string,
  zone: string,
  endpoints = OVERPASS_ENDPOINTS,
): Promise<{ rawPath: string; elements: number }> {
  const zoneDir = join(contentRoot, "maps", zone);
  const manifest = zoneManifestSchema.parse(await readJson(join(zoneDir, "zone.json")));
  const bbox = boundaryBBox((await readJson(join(zoneDir, manifest.boundary))) as Geo);
  const body = new URLSearchParams({ data: overpassQuery(bbox) });

  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        lastError = `${endpoint}: HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      const parsed = JSON.parse(text) as {
        elements?: unknown[];
        osm3s?: { timestamp_osm_base?: string };
      };
      if (!parsed.elements || parsed.elements.length === 0) {
        lastError = `${endpoint}: không có phần tử nào`;
        continue;
      }
      await mkdir(join(zoneDir, "raw"), { recursive: true });
      const rawPath = join(zoneDir, "raw", `${zone}.osm.json`);
      await writeFile(rawPath, text);
      await writeFile(
        join(zoneDir, "raw", `${zone}.meta.json`),
        `${JSON.stringify(
          {
            source: "OpenStreetMap via Overpass API",
            endpoint,
            downloadedAt: new Date().toISOString(),
            osmBaseTimestamp: parsed.osm3s?.timestamp_osm_base ?? null,
            bbox,
            elementCount: parsed.elements.length,
            sha256: createHash("sha256").update(text).digest("hex"),
            license: "ODbL 1.0, © OpenStreetMap contributors",
          },
          null,
          2,
        )}\n`,
      );
      return { rawPath, elements: parsed.elements.length };
    } catch (e) {
      lastError = `${endpoint}: ${(e as Error).message}`;
    }
  }
  throw new Error(`Không tải được OSM từ máy chủ Overpass nào (lỗi cuối: ${lastError})`);
}
