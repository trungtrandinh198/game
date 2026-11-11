import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface ObjectStore {
  exists(key: string): Promise<boolean>;
  put(
    key: string,
    body: Uint8Array,
    opts: { contentType: string; cacheControl: string },
  ): Promise<void>;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".webp": "image/webp",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".bin": "application/octet-stream",
};

export const contentTypeFor = (key: string) =>
  TYPES[key.slice(key.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

/** Tệp có phiên bản trong đường dẫn là bất biến; `catalog.json` và tài liệu sinh ra thì cache ngắn. */
export const cacheControlFor = (key: string) =>
  /(^|\/)v[0-9a-f]+(-[0-9a-f]{8})?\//.test(key) ? IMMUTABLE : SHORT;

export interface PublishResult {
  uploaded: string[];
  skipped: string[];
}

export async function publishDist(distRoot: string, store: ObjectStore): Promise<PublishResult> {
  const keys: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else keys.push(relative(distRoot, p).split(sep).join("/"));
    }
  };
  await walk(distRoot);
  // Tệp có phiên bản lên trước, tệp cache ngắn (catalog.json) lên cuối.
  keys.sort(
    (a, b) =>
      Number(cacheControlFor(a) === SHORT) - Number(cacheControlFor(b) === SHORT) ||
      a.localeCompare(b),
  );

  const result: PublishResult = { uploaded: [], skipped: [] };
  for (const key of keys) {
    const cacheControl = cacheControlFor(key);
    if (cacheControl === IMMUTABLE && (await store.exists(key))) {
      result.skipped.push(key);
      continue;
    }
    await store.put(key, await readFile(join(distRoot, key)), {
      contentType: contentTypeFor(key),
      cacheControl,
    });
    result.uploaded.push(key);
  }
  return result;
}

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<
    string,
    { body: Uint8Array; contentType: string; cacheControl: string }
  >();

  async exists(key: string) {
    return this.objects.has(key);
  }

  async put(key: string, body: Uint8Array, opts: { contentType: string; cacheControl: string }) {
    this.objects.set(key, { body, ...opts });
  }
}

export function createS3Store(env: Record<string, string | undefined>): ObjectStore {
  const bucket = env["S3_BUCKET"];
  if (!bucket || !env["S3_ACCESS_KEY_ID"] || !env["S3_SECRET_ACCESS_KEY"]) {
    throw new Error("Thiếu S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");
  }
  const client = new S3Client({
    region: env["S3_REGION"] ?? "us-east-1",
    ...(env["S3_ENDPOINT"] ? { endpoint: env["S3_ENDPOINT"], forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: env["S3_ACCESS_KEY_ID"],
      secretAccessKey: env["S3_SECRET_ACCESS_KEY"],
    },
  });
  return {
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (e) {
        if (
          (e as { name?: string }).name === "NotFound" ||
          (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
        )
          return false;
        throw e;
      }
    },
    async put(key, body, opts) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: opts.contentType,
          CacheControl: opts.cacheControl,
        }),
      );
    },
  };
}
