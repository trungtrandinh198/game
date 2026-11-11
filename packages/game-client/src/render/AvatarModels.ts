import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Chiều cao mục tiêu của nhân vật (m); model được co/giãn theo để đồng nhất giữa các avatar. */
const TARGET_HEIGHT_M = 1.75;

/**
 * Kho model nhân vật: tải GLB theo `avatarCode` một lần (cache), mỗi người chơi nhận một bản sao
 * dùng chung geometry/material. Chưa tải xong hoặc lỗi thì trả `undefined` để view dùng hình tạm.
 */
export class AvatarModels {
  private readonly urls: Map<string, string>;
  private readonly cache = new Map<string, Promise<THREE.Object3D | undefined>>();
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  constructor(items: readonly { code: string; modelUrl: string }[]) {
    this.urls = new Map(items.map((i) => [i.code, i.modelUrl]));
  }

  /** Bản sao model của avatar, hoặc `undefined` nếu avatar không có trong danh mục/không tải được. */
  async instance(code: string): Promise<THREE.Object3D | undefined> {
    let pending = this.cache.get(code);
    if (!pending) {
      const url = this.urls.get(code);
      pending = url ? this.load(url) : Promise.resolve(undefined);
      this.cache.set(code, pending);
    }
    const template = await pending;
    return template ? clone(template) : undefined;
  }

  private async load(url: string): Promise<THREE.Object3D | undefined> {
    try {
      const gltf = await this.loader.loadAsync(url);
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const height = box.max.y - box.min.y;
      if (height > 0.01) root.scale.multiplyScalar(TARGET_HEIGHT_M / height);
      root.position.y -= box.min.y * (TARGET_HEIGHT_M / Math.max(height, 0.01));
      const wrapper = new THREE.Group();
      wrapper.add(root);
      return wrapper;
    } catch {
      return undefined;
    }
  }

  /** Giải phóng geometry/material/texture của mọi model đã tải. */
  async dispose(): Promise<void> {
    for (const pending of this.cache.values()) {
      const template = await pending;
      template?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      });
    }
    this.cache.clear();
  }
}
