import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { VEHICLE_DEFAULTS } from "@dnw/game-config";
import { toGeo } from "@dnw/game-core";
import { REQUIRED_CLIPS } from "@dnw/schemas";
import { buildBoxesGlb, buildCharacterGlb, buildVehicleGlb, RIG_BONES } from "../glb/models";
import { defaultContentRoot } from "../paths";

const ORIGIN = { lon: 108.2272, lat: 16.0612 };
const LICENSE = { author: "Da Nang World (placeholder tự tạo)", license: "CC0-1.0" };
const LICENSE_MD =
  "# Giấy phép\n\nTài sản placeholder do dự án tự tạo, phát hành theo CC0-1.0. Thay bằng asset thật trước khi mở công khai.\n";

const write = async (path: string, data: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function thumbnail(color: string, label: string): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><text x="128" y="140" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#fff">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Ghi khung `content/` và các mục placeholder; chạy lại cho cùng kết quả (xác định). */
export async function generatePlaceholders(root: string = defaultContentRoot()): Promise<void> {
  const clips = Object.fromEntries(REQUIRED_CLIPS.map((c) => [c, c]));

  await write(
    join(root, "shared", "rigs", "humanoid_v1.json"),
    json({
      schemaVersion: 1,
      id: "humanoid_v1",
      bones: RIG_BONES,
      requiredClips: REQUIRED_CLIPS,
      maxBones: 65,
    }),
  );

  for (const [id, gender, shirt] of [
    ["male-01", "male", 0x3b82f6],
    ["male-02", "male", 0x16a34a],
    ["female-01", "female", 0xdb2777],
    ["female-02", "female", 0xf59e0b],
  ] as const) {
    const dir = join(root, "characters", id);
    await write(join(dir, "model.glb"), await buildCharacterGlb({ shirt }));
    await write(join(dir, "thumbnail.webp"), await thumbnail(hex(shirt), id));
    await write(join(dir, "LICENSE.md"), LICENSE_MD);
    await write(
      join(dir, "character.json"),
      json({
        schemaVersion: 1,
        id,
        version: 1,
        gender,
        rig: "humanoid_v1",
        model: "model.glb",
        thumbnail: "thumbnail.webp",
        clips,
        license: LICENSE,
      }),
    );
  }

  const poses = { bicycle: "ride_bicycle", motorbike: "ride_motorbike", car: "sit_car" } as const;
  const wheels = {
    bicycle: ["wheel_front", "wheel_rear"],
    motorbike: ["wheel_front", "wheel_rear"],
    car: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"],
  } as const;
  for (const [kind, color] of [
    ["bicycle", 0xef4444],
    ["motorbike", 0x111827],
    ["car", 0xeab308],
  ] as const) {
    const id = `${kind}-01`;
    const d = VEHICLE_DEFAULTS[kind];
    const dir = join(root, "vehicles", id);
    await write(join(dir, "model.glb"), await buildVehicleGlb({ kind, ...d.dimensions, color }));
    await write(join(dir, "thumbnail.webp"), await thumbnail(hex(color), id));
    await write(join(dir, "LICENSE.md"), LICENSE_MD);
    await write(
      join(dir, "vehicle.json"),
      json({
        schemaVersion: 1,
        id,
        version: 1,
        kind,
        model: "model.glb",
        thumbnail: "thumbnail.webp",
        nodes: { wheels: wheels[kind], ...(kind === "car" ? {} : { steer: "handlebar" }) },
        seats: [
          {
            id: "driver",
            socket: "seat_driver",
            pose: poses[kind],
            hideRider: false,
            riderOffset: { position: [0, 0, 0], rotationY: 0 },
          },
        ],
        dimensions: d.dimensions,
        handling: d.handling,
        surfaceSpeedFactor: d.surfaceSpeedFactor,
        license: LICENSE,
      }),
    );
  }

  const zoneDir = join(root, "maps", "han-river-core");
  const h = 512;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
    [-h, -h],
  ].map(([x, z]) => {
    const g = toGeo(ORIGIN, x!, z!);
    return [Number(g.lon.toFixed(7)), Number(g.lat.toFixed(7))];
  });
  await write(
    join(zoneDir, "boundary.geojson"),
    json({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [corners] },
    }),
  );
  await write(
    join(zoneDir, "zone.json"),
    json({
      schemaVersion: 1,
      code: "han-river-core",
      name: "Han River Core",
      origin: ORIGIN,
      crs: "EPSG:32649",
      chunkSizeM: 256,
      boundary: "boundary.geojson",
    }),
  );
  await write(
    join(zoneDir, "overrides.json"),
    json({ schemaVersion: 1, buildings: [], removeFeatures: [] }),
  );
  const at = (x: number, z: number) => {
    const g = toGeo(ORIGIN, x, z);
    return { lon: Number(g.lon.toFixed(7)), lat: Number(g.lat.toFixed(7)) };
  };
  await write(
    join(zoneDir, "spawn_points.json"),
    json({
      schemaVersion: 1,
      spawns: [-20, 0, 20].map((x, i) => ({ id: `sp-00${i + 1}`, ...at(x, 4), headingDeg: 0 })),
    }),
  );
  await write(
    join(zoneDir, "vehicle_spawns.json"),
    json({
      schemaVersion: 1,
      spawns: [
        { id: "vs-001", vehicle: "bicycle-01", ...at(-30, 8), headingDeg: 90, respawnSeconds: 120 },
        {
          id: "vs-002",
          vehicle: "motorbike-01",
          ...at(-10, 8),
          headingDeg: 90,
          respawnSeconds: 120,
        },
        { id: "vs-003", vehicle: "car-01", ...at(10, -8), headingDeg: 90, respawnSeconds: 120 },
      ],
    }),
  );

  const lmDir = join(root, "landmarks", "sample-monument");
  await write(
    join(lmDir, "model.glb"),
    await buildBoxesGlb([
      { name: "base", size: [10, 2, 10], center: [0, 1, 0], color: 0x9ca3af },
      { name: "tower", size: [4, 20, 4], center: [0, 12, 0], color: 0xd1d5db },
    ]),
  );
  await write(join(lmDir, "media", "cover.webp"), await thumbnail("#64748b", "sample"));
  await write(
    join(lmDir, "media", "media.json"),
    json({
      schemaVersion: 1,
      items: [
        {
          file: "cover.webp",
          copyrightCredit: "Da Nang World",
          license: "CC0-1.0",
          alt: { vi: "Ảnh minh họa", en: "Placeholder image" },
        },
      ],
    }),
  );
  await write(
    join(lmDir, "i18n", "vi.json"),
    json({
      name: "Đài tưởng niệm mẫu",
      shortDescription: "Địa danh mẫu để thử hệ thống.",
      description: "Nội dung placeholder; thay bằng nội dung thật trong trang quản trị.",
    }),
  );
  await write(
    join(lmDir, "i18n", "en.json"),
    json({
      name: "Sample monument",
      shortDescription: "Sample landmark for testing.",
      description: "Placeholder content; replace it in the admin area.",
    }),
  );
  await write(join(lmDir, "LICENSE.md"), LICENSE_MD);
  await write(
    join(lmDir, "landmark.json"),
    json({
      schemaVersion: 1,
      code: "sample-monument",
      version: 1,
      zone: "han-river-core",
      category: "park",
      location: at(40, -60),
      interactionRadiusM: 25,
      rotationY: 0,
      scale: 1,
      model: "model.glb",
      lods: [],
      replacesOsmBuildings: [],
      cover: "media/cover.webp",
      license: LICENSE,
    }),
  );

  for (const [id, parts, collision] of [
    [
      "tree-01",
      [
        {
          name: "trunk",
          size: [0.3, 2, 0.3] as [number, number, number],
          center: [0, 1, 0] as [number, number, number],
          color: 0x78350f,
        },
        {
          name: "canopy",
          size: [2, 2.5, 2] as [number, number, number],
          center: [0, 3.2, 0] as [number, number, number],
          color: 0x15803d,
        },
      ],
      { type: "circle", radius: 0.4 },
    ],
    [
      "street-lamp-01",
      [
        {
          name: "pole",
          size: [0.15, 5, 0.15] as [number, number, number],
          center: [0, 2.5, 0] as [number, number, number],
          color: 0x374151,
        },
        {
          name: "head",
          size: [0.6, 0.2, 0.3] as [number, number, number],
          center: [0.2, 5.1, 0] as [number, number, number],
          color: 0xfde68a,
        },
      ],
      { type: "none" },
    ],
  ] as const) {
    const dir = join(root, "props", id);
    await write(join(dir, "model.glb"), await buildBoxesGlb([...parts]));
    await write(join(dir, "LICENSE.md"), LICENSE_MD);
    await write(
      join(dir, "prop.json"),
      json({
        schemaVersion: 1,
        id,
        version: 1,
        model: "model.glb",
        instanced: true,
        collision,
        license: LICENSE,
      }),
    );
  }

  await generateTemplates(root);
}

/** Mẫu cho `content:new`; `__ID__` được thay bằng id mới. */
async function generateTemplates(root: string): Promise<void> {
  const t = (kind: string, file: string, data: unknown) =>
    write(join(root, "_templates", kind, file), json(data));
  const license = { author: "TODO", license: "CC0-1.0", sourceUrl: "TODO" };
  await t("character", "character.json", {
    schemaVersion: 1,
    id: "__ID__",
    version: 1,
    gender: "male",
    rig: "humanoid_v1",
    model: "model.glb",
    thumbnail: "thumbnail.webp",
    clips: Object.fromEntries(REQUIRED_CLIPS.map((c) => [c, c])),
    license,
  });
  await t("vehicle", "vehicle.json", {
    schemaVersion: 1,
    id: "__ID__",
    version: 1,
    kind: "car",
    model: "model.glb",
    thumbnail: "thumbnail.webp",
    nodes: { wheels: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"] },
    seats: [
      {
        id: "driver",
        socket: "seat_driver",
        pose: "sit_car",
        hideRider: false,
        riderOffset: { position: [0, 0, 0], rotationY: 0 },
      },
    ],
    dimensions: VEHICLE_DEFAULTS.car.dimensions,
    handling: VEHICLE_DEFAULTS.car.handling,
    surfaceSpeedFactor: VEHICLE_DEFAULTS.car.surfaceSpeedFactor,
    license,
  });
  await t("landmark", "landmark.json", {
    schemaVersion: 1,
    code: "__ID__",
    version: 1,
    zone: "han-river-core",
    category: "street",
    location: ORIGIN,
    interactionRadiusM: 25,
    rotationY: 0,
    scale: 1,
    model: "model.glb",
    lods: [],
    replacesOsmBuildings: [],
    license,
  });
  await t("landmark", "i18n/vi.json", { name: "TODO", shortDescription: "", description: "" });
  await t("landmark", "i18n/en.json", { name: "TODO", shortDescription: "", description: "" });
  await t("zone", "zone.json", {
    schemaVersion: 1,
    code: "__ID__",
    name: "TODO",
    origin: ORIGIN,
    crs: "EPSG:32649",
    chunkSizeM: 256,
    boundary: "boundary.geojson",
  });
  await t("zone", "spawn_points.json", { schemaVersion: 1, spawns: [] });
  await t("zone", "vehicle_spawns.json", { schemaVersion: 1, spawns: [] });
  await t("prop", "prop.json", {
    schemaVersion: 1,
    id: "__ID__",
    version: 1,
    model: "model.glb",
    instanced: true,
    collision: { type: "none" },
    license,
  });
}
