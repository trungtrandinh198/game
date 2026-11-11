import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { afterAll, describe, expect, it } from "vitest";
import { buildBoxesGlb } from "./glb/models";
import { readJson } from "./paths";
import { cleanupTemp, baseContent, freshContent } from "./test-utils";
import { validateContent } from "./validate";

afterAll(cleanupTemp);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function edit(path: string, fn: (json: Json) => void) {
  const json = (await readJson(path)) as Json;
  fn(json);
  await writeFile(path, JSON.stringify(json, null, 2));
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("validateContent", () => {
  it("content placeholder hợp lệ", async () => {
    expect(await validateContent(await baseContent())).toEqual([]);
  });

  it("thiếu license thì báo LICENSE_MISSING", async () => {
    const dir = await freshContent();
    await edit(join(dir, "characters/male-01/character.json"), (j) => delete j.license);
    const issues = await validateContent(dir, { kind: "character" });
    expect(codes(issues)).toContain("LICENSE_MISSING");
    expect(issues.every((i) => i.id === "male-01")).toBe(true);
  });

  it("thiếu clip trong manifest và clip trỏ tới animation không có trong GLB", async () => {
    const dir = await freshContent();
    await edit(join(dir, "characters/male-01/character.json"), (j) => delete j.clips.run);
    await edit(
      join(dir, "characters/male-02/character.json"),
      (j) => (j.clips.walk = "nonexistent"),
    );
    const issues = await validateContent(dir, { kind: "character" });
    const byId = (id: string) => issues.filter((i) => i.id === id);
    expect(byId("male-01").map((i) => i.code)).toContain("CLIP_MISSING");
    expect(byId("male-01")[0]!.message).toMatch(/run/);
    expect(byId("male-02").map((i) => i.code)).toContain("CLIP_MISSING");
    expect(byId("male-02")[0]!.message).toMatch(/nonexistent/);
  });

  it("thiếu node bắt buộc của xe trong GLB", async () => {
    const dir = await freshContent();
    const path = join(dir, "vehicles/car-01/model.glb");
    const io = new NodeIO();
    const doc = await io.readBinary(new Uint8Array(await readFile(path)));
    doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "seat_driver")!
      .setName("renamed");
    doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "wheel_rr")!
      .setName("tire");
    await writeFile(path, await io.writeBinary(doc));
    const issues = await validateContent(dir, { kind: "vehicle", id: "car-01" });
    expect(
      issues
        .filter((i) => i.code === "NODE_MISSING")
        .map((i) => i.message)
        .join("\n"),
    ).toMatch(/seat_driver[\s\S]*wheel_rr|wheel_rr[\s\S]*seat_driver/);
  });

  it("thiếu xương của rig", async () => {
    const dir = await freshContent();
    await edit(join(dir, "shared/rigs/humanoid_v1.json"), (j) => j.bones.push("tail"));
    const issues = await validateContent(dir, { kind: "character", id: "male-01" });
    expect(issues.some((i) => i.code === "BONE_MISSING" && /tail/.test(i.message))).toBe(true);
  });

  it("vượt ngân sách tam giác", async () => {
    const dir = await freshContent();
    const parts = Array.from({ length: 600 }, (_, i) => ({
      name: `b${i}`,
      size: [0.1, 0.1, 0.1] as [number, number, number],
      center: [i * 0.2, 0, 0] as [number, number, number],
      color: 0x888888,
    }));
    await writeFile(join(dir, "props/tree-01/model.glb"), await buildBoxesGlb(parts)); // 600 * 12 = 7200 > 5000
    const issues = await validateContent(dir, { kind: "prop", id: "tree-01" });
    expect(codes(issues)).toContain("BUDGET_TRIANGLES");
  });

  it("vượt ngân sách dung lượng", async () => {
    const dir = await freshContent();
    const model = await buildBoxesGlb([
      { name: "x", size: [1, 1, 1], center: [0, 0, 0], color: 0 },
    ]);
    const io = new NodeIO();
    const d2 = await io.readBinary(model);
    d2.createAccessor("padding")
      .setType("SCALAR")
      .setArray(new Float32Array(100_000))
      .setBuffer(d2.getRoot().listBuffers()[0]!);
    await writeFile(join(dir, "props/tree-01/model.glb"), await io.writeBinary(d2));
    expect(codes(await validateContent(dir, { kind: "prop", id: "tree-01" }))).toContain(
      "BUDGET_SIZE",
    );
  });

  it("id trùng và thư mục khác id", async () => {
    const dir = await freshContent();
    await cp(join(dir, "characters/male-01"), join(dir, "characters/male-03"), { recursive: true });
    const issues = await validateContent(dir, { kind: "character" });
    expect(
      issues
        .filter((i) => i.id === "male-03")
        .map((i) => i.code)
        .sort(),
    ).toEqual(["ID_DUPLICATE", "ID_MISMATCH"]);
  });

  it("id không phải kebab-case", async () => {
    const dir = await freshContent();
    await edit(join(dir, "props/tree-01/prop.json"), (j) => (j.id = "Tree_01"));
    const issues = await validateContent(dir, { kind: "prop" });
    expect(codes(issues)).toEqual(expect.arrayContaining(["SCHEMA", "ID_MISMATCH"]));
  });

  it("địa danh nằm ngoài biên zone, hoặc zone không tồn tại", async () => {
    const dir = await freshContent();
    await edit(
      join(dir, "landmarks/sample-monument/landmark.json"),
      (j) => (j.location = { lon: 109.5, lat: 17.5 }),
    );
    expect(codes(await validateContent(dir, { kind: "landmark" }))).toContain("OUTSIDE_ZONE");
    await edit(join(dir, "landmarks/sample-monument/landmark.json"), (j) => (j.zone = "nowhere"));
    expect(codes(await validateContent(dir, { kind: "landmark" }))).toContain("ZONE_MISSING");
  });

  it("kích thước model lệch quá 10% so với manifest", async () => {
    const dir = await freshContent();
    await edit(join(dir, "vehicles/motorbike-01/vehicle.json"), (j) => (j.dimensions.length = 3.5));
    const issues = await validateContent(dir, { kind: "vehicle", id: "motorbike-01" });
    expect(issues.some((i) => i.code === "DIMENSIONS_MISMATCH" && /length/.test(i.message))).toBe(
      true,
    );
  });

  it("thiếu file model, thumbnail, i18n vi, hoặc manifest hỏng", async () => {
    const dir = await freshContent();
    await rm(join(dir, "characters/male-01/model.glb"));
    await rm(join(dir, "characters/male-02/thumbnail.webp"));
    await rm(join(dir, "landmarks/sample-monument/i18n/vi.json"));
    await writeFile(join(dir, "props/tree-01/prop.json"), "{ not json");
    const issues = await validateContent(dir);
    expect(
      issues
        .filter((i) => i.code === "FILE_MISSING")
        .map((i) => `${i.id}:${i.message}`)
        .join("|"),
    ).toMatch(/male-01.*model\.glb/);
    expect(issues.some((i) => i.id === "male-02" && i.code === "FILE_MISSING")).toBe(true);
    expect(issues.some((i) => i.id === "sample-monument" && i.code === "FILE_MISSING")).toBe(true);
    expect(issues.some((i) => i.id === "tree-01" && /JSON hỏng/.test(i.message))).toBe(true);
  });

  it("GLB hỏng không phải glTF", async () => {
    const dir = await freshContent();
    await writeFile(join(dir, "props/tree-01/model.glb"), "not a glb");
    expect(codes(await validateContent(dir, { kind: "prop", id: "tree-01" }))).toContain(
      "GLB_INVALID",
    );
  });

  it("xe tham chiếu trong vehicle_spawns phải tồn tại; spawn phải trong biên", async () => {
    const dir = await freshContent();
    await edit(join(dir, "maps/han-river-core/vehicle_spawns.json"), (j) => {
      j.spawns[0].vehicle = "ghost-01";
      j.spawns[1].lon = 100;
    });
    const issues = await validateContent(dir, { kind: "zone" });
    expect(codes(issues)).toEqual(expect.arrayContaining(["VEHICLE_REF_MISSING", "OUTSIDE_ZONE"]));
  });

  it("bộ lọc --kind và --id chỉ kiểm tra phần được chọn", async () => {
    const dir = await freshContent();
    await edit(join(dir, "characters/male-01/character.json"), (j) => delete j.license);
    expect(await validateContent(dir, { kind: "vehicle" })).toEqual([]);
    expect(await validateContent(dir, { kind: "character", id: "female-01" })).toEqual([]);
    expect(
      (await validateContent(dir, { kind: "character", id: "male-01" })).length,
    ).toBeGreaterThan(0);
  });
});
