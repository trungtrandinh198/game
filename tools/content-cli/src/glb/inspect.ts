import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { getBounds, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

export interface GlbInfo {
  sizeBytes: number;
  triangles: number;
  jointCount: number;
  materialCount: number;
  nodeNames: Set<string>;
  jointNames: Set<string>;
  animationNames: Set<string>;
  /** [x, y, z] kích thước hộp bao của toàn cảnh (mét). */
  size: [number, number, number];
  minY: number;
  textureSizes: [number, number][];
  hasLightsOrCameras: boolean;
}

export async function createIO(): Promise<NodeIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
}

export function inspectDocument(doc: Document, sizeBytes: number): GlbInfo {
  const root = doc.getRoot();
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : (prim.getAttribute("POSITION")?.getCount() ?? 0);
      triangles += Math.floor(count / 3);
    }
  }
  const skins = root.listSkins();
  const jointNames = new Set(skins.flatMap((s) => s.listJoints().map((j) => j.getName())));
  const scene = root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    sizeBytes,
    triangles,
    jointCount: Math.max(0, ...skins.map((s) => s.listJoints().length)),
    materialCount: root.listMaterials().length,
    nodeNames: new Set(root.listNodes().map((n) => n.getName())),
    jointNames,
    animationNames: new Set(root.listAnimations().map((a) => a.getName())),
    size: [
      bounds.max[0]! - bounds.min[0]!,
      bounds.max[1]! - bounds.min[1]!,
      bounds.max[2]! - bounds.min[2]!,
    ],
    minY: bounds.min[1]!,
    textureSizes: root.listTextures().map((t) => t.getSize() ?? [0, 0]) as [number, number][],
    hasLightsOrCameras:
      root.listCameras().length > 0 ||
      root.listExtensionsUsed().some((e) => e.extensionName === "KHR_lights_punctual"),
  };
}

export async function inspectGlb(path: string, io: NodeIO, bytes?: Uint8Array): Promise<GlbInfo> {
  const data = bytes ?? new Uint8Array(await (await import("node:fs/promises")).readFile(path));
  const doc = await io.readBinary(data);
  return inspectDocument(doc, data.byteLength);
}
