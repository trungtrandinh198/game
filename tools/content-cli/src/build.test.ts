import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildContent, ContentValidationError, readCatalog } from "./build";
import { generateCredits } from "./credits";
import { createIO } from "./glb/inspect";
import { newContent } from "./new";
import { exists, readJson } from "./paths";
import { cacheControlFor, contentTypeFor, MemoryObjectStore, publishDist } from "./publish";
import { baseContent, cleanupTemp, freshContent, tempDir } from "./test-utils";
import { validateContent } from "./validate";

afterAll(cleanupTemp);

describe("buildContent", () => {
  it("ghi dist theo bố cục 16.6 với hash8 và catalog", async () => {
    const root = await baseContent();
    const dist = await tempDir();
    const catalog = await buildContent(root, dist);

    expect(catalog.items.map((i) => `${i.kind}:${i.id}`).sort()).toEqual([
      "character:female-01",
      "character:female-02",
      "character:male-01",
      "character:male-02",
      "landmark:sample-monument",
      "prop:street-lamp-01",
      "prop:tree-01",
      "vehicle:bicycle-01",
      "vehicle:car-01",
      "vehicle:motorbike-01",
    ]);
    for (const e of catalog.items) {
      expect(e.prefix).toMatch(
        /^(characters|vehicles|landmarks|props)\/[a-z0-9-]+\/v1-[0-9a-f]{8}$/,
      );
      expect(e.files.model).toBe(`${e.prefix}/model.glb`);
      expect(await exists(join(dist, e.files.model))).toBe(true);
    }
    const male = catalog.items.find((i) => i.id === "male-01")!;
    expect(male.files.thumbnail).toBe(`${male.prefix}/thumbnail.webp`);
    const lm = catalog.items.find((i) => i.kind === "landmark")!;
    expect(lm.files.cover).toBe(`${lm.prefix}/media/cover.webp`);
    expect(await exists(join(dist, "catalog.json"))).toBe(true);
    expect(await readCatalog(dist)).toEqual(catalog);
  });

  it("GLB đầu ra được nén meshopt và vẫn đọc được", async () => {
    const dist = await tempDir();
    const catalog = await buildContent(await baseContent(), dist);
    const car = catalog.items.find((i) => i.id === "car-01")!;
    const bytes = await readFile(join(dist, car.files.model));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    expect(json.extensionsUsed).toContain("EXT_meshopt_compression");
    // Đọc lại được khi đăng ký bộ giải nén
    const doc = await (await createIO()).readBinary(new Uint8Array(bytes));
    expect(
      doc
        .getRoot()
        .listNodes()
        .some((n) => n.getName() === "seat_driver"),
    ).toBe(true);
  });

  it("kết quả xác định: build hai lần cho cùng hash", async () => {
    const root = await baseContent();
    const a = await buildContent(root, await tempDir());
    const b = await buildContent(root, await tempDir());
    expect(a).toEqual(b);
  });

  it("đổi nội dung thì hash8 đổi; đổi version thì đường dẫn đổi", async () => {
    const root = await freshContent();
    const before = (await buildContent(root, await tempDir())).items.find(
      (i) => i.id === "car-01",
    )!;
    const path = join(root, "vehicles/car-01/vehicle.json");
    const m = (await readJson(path)) as { version: number };
    await writeFile(path, JSON.stringify({ ...m, version: 2 }));
    const after = (await buildContent(root, await tempDir())).items.find((i) => i.id === "car-01")!;
    expect(after.prefix).toMatch(/\/v2-/);
    expect(after.prefix).not.toBe(before.prefix);
  });

  it("từ chối build khi content không hợp lệ", async () => {
    const root = await freshContent();
    await rm(join(root, "characters/male-01/model.glb"));
    const dist = await tempDir();
    await expect(buildContent(root, dist)).rejects.toBeInstanceOf(ContentValidationError);
    expect(await exists(join(dist, "catalog.json"))).toBe(false);
  });
});

describe("publishDist", () => {
  it("cache bất biến cho tệp có phiên bản, cache ngắn cho catalog; catalog lên cuối; chạy lại bỏ qua tệp đã có", async () => {
    const dist = await tempDir();
    const catalog = await buildContent(await baseContent(), dist);
    const store = new MemoryObjectStore();
    const order: string[] = [];
    const put = store.put.bind(store);
    store.put = async (key, body, opts) => {
      order.push(key);
      return put(key, body, opts);
    };

    const first = await publishDist(dist, store);
    expect(first.skipped).toEqual([]);
    expect(order.at(-1)).toBe("catalog.json");
    for (const [key, obj] of store.objects) {
      if (key === "catalog.json") expect(obj.cacheControl).toBe("public, max-age=60");
      else expect(obj.cacheControl, key).toBe("public, max-age=31536000, immutable");
    }
    expect(
      store.objects.get(catalog.items.find((i) => i.id === "male-01")!.files.model)?.contentType,
    ).toBe("model/gltf-binary");

    const second = await publishDist(dist, store);
    expect(second.uploaded).toEqual(["catalog.json"]);
    expect(second.skipped.length).toBe(first.uploaded.length - 1);
  });

  it("nhận diện kiểu nội dung và cache theo khóa", () => {
    expect(contentTypeFor("a/b.webp")).toBe("image/webp");
    expect(contentTypeFor("catalog.json")).toBe("application/json");
    expect(cacheControlFor("vehicles/car-01/v3-0123abcd/model.glb")).toMatch(/immutable/);
    expect(cacheControlFor("ui/v0123abcd/hud.svg")).toMatch(/immutable/);
    expect(cacheControlFor("catalog.json")).toBe("public, max-age=60");
    expect(cacheControlFor("CREDITS.md")).toBe("public, max-age=60");
  });
});

describe("content:new", () => {
  it("tạo thư mục từ mẫu, điền id, và validate báo thiếu file cho tới khi đặt model", async () => {
    const root = await freshContent();
    const target = await newContent(root, "character", "test-01");
    expect(target.endsWith("characters/test-01")).toBe(true);
    const manifest = JSON.parse(await readFile(join(target, "character.json"), "utf8"));
    expect(manifest.id).toBe("test-01");
    expect(await exists(join(target, "LICENSE.md"))).toBe(true);

    const missing = await validateContent(root, { kind: "character", id: "test-01" });
    expect(missing.some((i) => i.code === "FILE_MISSING")).toBe(true);

    await cp(join(root, "characters/male-01/model.glb"), join(target, "model.glb"));
    await cp(join(root, "characters/male-01/thumbnail.webp"), join(target, "thumbnail.webp"));
    expect(await validateContent(root, { kind: "character", id: "test-01" })).toEqual([]);
  });

  it("từ chối loại/id sai và thư mục đã tồn tại", async () => {
    const root = await freshContent();
    await expect(newContent(root, "boat", "x-01")).rejects.toThrow(/Loại không hợp lệ/);
    await expect(newContent(root, "prop", "Bad_ID")).rejects.toThrow(/không hợp lệ/);
    await expect(newContent(root, "prop", "tree-01")).rejects.toThrow(/đã tồn tại/);
  });
});

describe("CREDITS", () => {
  it("liệt kê license của mọi mục và ghi công OSM", async () => {
    const text = await generateCredits(await baseContent());
    expect(text).toMatch(/OpenStreetMap contributors/);
    expect(text).toMatch(
      /\| characters \| male-01 \| Da Nang World \(placeholder tự tạo\) \| CC0-1\.0 \|/,
    );
    expect(text.split("\n").filter((l) => l.startsWith("| ")).length).toBeGreaterThanOrEqual(
      2 + 10,
    );
  });
});
