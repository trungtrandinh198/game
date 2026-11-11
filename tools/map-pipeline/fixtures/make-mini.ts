/** Sinh `mini.osm.json`: dữ liệu OSM nhỏ, dựng tay theo tọa độ local quanh gốc Cầu Rồng, dùng cho test. */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toGeo } from "@dnw/game-core";

export const FIXTURE_ORIGIN = { lon: 108.2272, lat: 16.0612 };

type Pt = [number, number];
interface Element {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: { type: "way"; ref: number; role: string }[];
  tags?: Record<string, string>;
}

export function buildMiniOsm(): { version: number; generator: string; elements: Element[] } {
  const elements: Element[] = [];
  let nodeId = 1000;
  let wayId = 5000;

  const way = (pts: Pt[], tags: Record<string, string>, close = false): number => {
    const ids = pts.map(([x, z]) => {
      const g = toGeo(FIXTURE_ORIGIN, x, z);
      elements.push({
        type: "node",
        id: ++nodeId,
        lon: Math.round(g.lon * 1e7) / 1e7,
        lat: Math.round(g.lat * 1e7) / 1e7,
      });
      return nodeId;
    });
    if (close) ids.push(ids[0]!);
    elements.push({ type: "way", id: ++wayId, nodes: ids, tags });
    return wayId;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];

  way(rect(-60, -60, -40, -40), { building: "yes", height: "12" }, true);
  way(rect(-30, -60, -10, -40), { building: "apartments", "building:levels": "5" }, true);
  way(rect(-5, -60, 5.5, -50), { building: "house" }, true);
  way(rect(0, 60, 0.5, 60.5), { building: "yes" }, true); // < 1 m², phải bị bỏ

  // nhà có sân trong: relation multipolygon
  const outer = way(rect(30, -70, 70, -30), {}, true);
  const inner = way(rect(40, -60, 60, -40), {}, true);
  elements.push({
    type: "relation",
    id: 9001,
    members: [
      { type: "way", ref: outer, role: "outer" },
      { type: "way", ref: inner, role: "inner" },
    ],
    tags: { type: "multipolygon", building: "commercial" },
  });

  way(
    [
      [-150, 0],
      [90, 0],
    ],
    { highway: "primary", name: "Đường chính" },
  );
  way(
    [
      [90, 0],
      [150, 0],
    ],
    { highway: "primary", bridge: "yes", name: "Cầu" },
  );
  way(
    [
      [0, -150],
      [0, 150],
    ],
    { highway: "residential", name: "Hẻm" },
  );
  way(
    [
      [-80, 20],
      [-20, 20],
    ],
    { highway: "footway" },
  );
  way(
    [
      [-250, 120],
      [-120, 120],
    ],
    { highway: "tertiary", width: "9" },
  );

  way(rect(100, -200, 140, 200), { natural: "water" }, true);
  way(
    [
      [-100, 40],
      [-40, 40],
      [-40, 100],
      [-100, 100],
    ],
    { leisure: "park" },
    true,
  );

  for (const [x, z] of [
    [-20, 30],
    [10, 30],
    [-50, -50],
  ] as Pt[]) {
    const g = toGeo(FIXTURE_ORIGIN, x, z);
    elements.push({
      type: "node",
      id: ++nodeId,
      lon: Math.round(g.lon * 1e7) / 1e7,
      lat: Math.round(g.lat * 1e7) / 1e7,
      tags: { natural: "tree" },
    });
  }
  return { version: 0.6, generator: "danang-world fixture", elements };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = fileURLToPath(new URL("./mini.osm.json", import.meta.url));
  await writeFile(out, `${JSON.stringify(buildMiniOsm(), null, 1)}\n`);
  console.log(`Đã ghi ${out}`);
}
