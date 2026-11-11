import {
  chunkManifestSchema,
  collisionFileSchema,
  zoneIndexSchema,
  type ChunkManifest,
  type ZoneIndex,
} from "@dnw/schemas";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Limiter, withRetry } from "./net";
import { parseSurface, type SurfaceGrid } from "./surface";

export interface LoadedChunk {
  code: string;
  manifest: ChunkManifest;
  /** Nhóm đối tượng ba chiều của chunk (tĩnh + vật đặt lặp); gọi `disposeChunk` khi bỏ. */
  group: THREE.Group;
  /** Đoạn va chạm [x1, z1, x2, z2] tính bằng mét. */
  segments: Float32Array;
  surface: SurfaceGrid;
}

export interface ChunkLoaderOptions {
  fetchFn?: typeof fetch;
  concurrency?: number;
  retries?: number;
  baseDelayMs?: number;
}

const treeGeometry = () => {
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 2, 6).translate(0, 1, 0);
  const canopy = new THREE.ConeGeometry(1.2, 3, 8).translate(0, 3.2, 0);
  return { trunk, canopy };
};

/** Tải index, chunk (GLB + va chạm + bề mặt) của một zone; dùng cho viewer và game (T11). */
export class ChunkLoader {
  private readonly fetchFn: typeof fetch;
  private readonly limiter: Limiter;
  private readonly retry: { retries: number; baseDelayMs: number };
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private base = "";
  index: ZoneIndex | null = null;

  constructor(options: ChunkLoaderOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((...a) => fetch(...a));
    this.limiter = new Limiter(options.concurrency ?? 4);
    this.retry = { retries: options.retries ?? 3, baseDelayMs: options.baseDelayMs ?? 300 };
  }

  private get<T>(url: string, read: (res: Response) => Promise<T>): Promise<T> {
    return this.limiter.run(() =>
      withRetry(async () => {
        const res = await this.fetchFn(url);
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return read(res);
      }, this.retry),
    );
  }

  async loadIndex(indexUrl: string): Promise<ZoneIndex> {
    this.base = indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1);
    this.index = zoneIndexSchema.parse(await this.get(indexUrl, (r) => r.json()));
    return this.index;
  }

  async loadChunk(code: string): Promise<LoadedChunk> {
    const entry = this.index?.chunks.find((c) => c.code === code);
    if (!entry) throw new Error(`Chunk ${code} không có trong index`);
    const manifestUrl = this.base + entry.manifest;
    const manifest = chunkManifestSchema.parse(await this.get(manifestUrl, (r) => r.json()));
    const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);

    const [glbBytes, collisionJson, surfaceBytes] = await Promise.all([
      this.get(dir + manifest.glb.url, (r) => r.arrayBuffer()),
      this.get(dir + manifest.collision.url, (r) => r.json()),
      this.get(dir + manifest.surface.url, (r) => r.arrayBuffer()),
    ]);
    const gltf = await this.gltf.parseAsync(glbBytes, "");
    const group = new THREE.Group();
    group.name = `chunk-${code}`;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true });
      }
    });
    group.add(gltf.scene);
    this.addInstances(group, manifest);

    const collision = collisionFileSchema.parse(collisionJson);
    const segments = new Float32Array(collision.segments.length * 4);
    collision.segments.forEach((s, i) => s.forEach((v, k) => (segments[i * 4 + k] = v / 100)));

    return { code, manifest, group, segments, surface: parseSurface(surfaceBytes) };
  }

  private addInstances(group: THREE.Group, manifest: ChunkManifest) {
    const trees = manifest.instances.filter((i) => i.type === "tree-01");
    const lamps = manifest.instances.filter((i) => i.type === "street-lamp-01");
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const place = (mesh: THREE.InstancedMesh, list: typeof trees) => {
      list.forEach((i, k) => {
        mesh.setMatrixAt(
          k,
          m.compose(
            new THREE.Vector3(i.x, 0, i.z),
            q.setFromAxisAngle(up, i.rotY),
            new THREE.Vector3(i.scale, i.scale, i.scale),
          ),
        );
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    };
    if (trees.length > 0) {
      const { trunk, canopy } = treeGeometry();
      place(
        new THREE.InstancedMesh(
          trunk,
          new THREE.MeshLambertMaterial({ color: 0x78350f }),
          trees.length,
        ),
        trees,
      );
      place(
        new THREE.InstancedMesh(
          canopy,
          new THREE.MeshLambertMaterial({ color: 0x15803d }),
          trees.length,
        ),
        trees,
      );
    }
    if (lamps.length > 0) {
      const pole = new THREE.CylinderGeometry(0.07, 0.07, 5, 6).translate(0, 2.5, 0);
      place(
        new THREE.InstancedMesh(
          pole,
          new THREE.MeshLambertMaterial({ color: 0x374151 }),
          lamps.length,
        ),
        lamps,
      );
    }
  }
}

/** Giải phóng geometry, material, texture của chunk (mục 16.10). */
export function disposeChunk(chunk: LoadedChunk): void {
  chunk.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
  chunk.group.removeFromParent();
}
