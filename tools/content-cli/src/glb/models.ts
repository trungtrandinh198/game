import { Document, NodeIO, type Node } from "@gltf-transform/core";
import type { VehicleKind } from "@dnw/schemas";
import {
  addMesh,
  boxGeometry,
  colorMaterial,
  mergeGeometry,
  wheelGeometry,
  type Geometry,
} from "./geometry";

export const RIG_BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulder_l",
  "upper_arm_l",
  "forearm_l",
  "hand_l",
  "shoulder_r",
  "upper_arm_r",
  "forearm_r",
  "hand_r",
  "thigh_l",
  "shin_l",
  "foot_l",
  "thigh_r",
  "shin_r",
  "foot_r",
] as const;

/** Vị trí khớp trong tư thế nhị phân (mét, gốc ở chân, mặt quay +Z). */
const BONE_POS: Record<(typeof RIG_BONES)[number], [number, number, number]> = {
  hips: [0, 0.95, 0],
  spine: [0, 1.05, 0],
  chest: [0, 1.25, 0],
  neck: [0, 1.5, 0],
  head: [0, 1.6, 0],
  shoulder_l: [0.2, 1.42, 0],
  upper_arm_l: [0.28, 1.42, 0],
  forearm_l: [0.28, 1.15, 0],
  hand_l: [0.28, 0.9, 0],
  shoulder_r: [-0.2, 1.42, 0],
  upper_arm_r: [-0.28, 1.42, 0],
  forearm_r: [-0.28, 1.15, 0],
  hand_r: [-0.28, 0.9, 0],
  thigh_l: [0.1, 0.92, 0],
  shin_l: [0.1, 0.5, 0],
  foot_l: [0.1, 0.08, 0],
  thigh_r: [-0.1, 0.92, 0],
  shin_r: [-0.1, 0.5, 0],
  foot_r: [-0.1, 0.08, 0],
};

const BONE_PARENT: Record<(typeof RIG_BONES)[number], (typeof RIG_BONES)[number] | null> = {
  hips: null,
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  shoulder_l: "chest",
  upper_arm_l: "shoulder_l",
  forearm_l: "upper_arm_l",
  hand_l: "forearm_l",
  shoulder_r: "chest",
  upper_arm_r: "shoulder_r",
  forearm_r: "upper_arm_r",
  hand_r: "forearm_r",
  thigh_l: "hips",
  shin_l: "thigh_l",
  foot_l: "shin_l",
  thigh_r: "hips",
  shin_r: "thigh_r",
  foot_r: "shin_r",
};

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

const io = new NodeIO();
const toBytes = (doc: Document) => io.writeBinary(doc);

const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!) as [number, number, number];

/** Nhân vật placeholder: hộp ghép, đủ bộ xương `humanoid_v1` và 6 clip bắt buộc. */
export async function buildCharacterGlb(options: {
  shirt: number;
  skin?: number;
}): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("scene");

  const nodes = new Map<string, Node>();
  for (const bone of RIG_BONES) {
    const parent = BONE_PARENT[bone];
    const local = parent ? sub(BONE_POS[bone], BONE_POS[parent]) : BONE_POS[bone];
    nodes.set(bone, doc.createNode(bone).setTranslation(local));
  }
  const root = doc.createNode("Armature");
  for (const bone of RIG_BONES) {
    const parent = BONE_PARENT[bone];
    (parent ? nodes.get(parent)! : root).addChild(nodes.get(bone)!);
  }

  const j = (b: (typeof RIG_BONES)[number]) => RIG_BONES.indexOf(b);
  const shirt = rgb(options.shirt);
  const skin = rgb(options.skin ?? 0xf6d2b0);
  const parts: [Geometry, boolean][] = [
    [boxGeometry([0.36, 0.2, 0.2], [0, 0.97, 0], j("hips")), true],
    [boxGeometry([0.38, 0.4, 0.22], [0, 1.28, 0], j("chest")), true],
    [boxGeometry([0.2, 0.22, 0.2], [0, 1.64, 0], j("head")), false],
    [boxGeometry([0.1, 0.3, 0.1], [0.28, 1.2, 0], j("upper_arm_l")), true],
    [boxGeometry([0.1, 0.3, 0.1], [-0.28, 1.2, 0], j("upper_arm_r")), true],
    [boxGeometry([0.1, 0.3, 0.1], [0.28, 0.92, 0], j("forearm_l")), false],
    [boxGeometry([0.1, 0.3, 0.1], [-0.28, 0.92, 0], j("forearm_r")), false],
    [boxGeometry([0.14, 0.42, 0.14], [0.1, 0.7, 0], j("thigh_l")), true],
    [boxGeometry([0.14, 0.42, 0.14], [-0.1, 0.7, 0], j("thigh_r")), true],
    [boxGeometry([0.14, 0.4, 0.14], [0.1, 0.3, 0], j("shin_l")), true],
    [boxGeometry([0.14, 0.4, 0.14], [-0.1, 0.3, 0], j("shin_r")), true],
    [boxGeometry([0.14, 0.1, 0.24], [0.1, 0.05, 0.04], j("foot_l")), true],
    [boxGeometry([0.14, 0.1, 0.24], [-0.1, 0.05, 0.04], j("foot_r")), true],
  ];
  const clothesGeometry = mergeGeometry(parts.filter(([, c]) => c).map(([g]) => g));
  const skinGeometry = mergeGeometry(parts.filter(([, c]) => !c).map(([g]) => g));

  const skinDef = doc.createSkin("skin");
  for (const bone of RIG_BONES) skinDef.addJoint(nodes.get(bone)!);
  const ibm = new Float32Array(RIG_BONES.length * 16);
  RIG_BONES.forEach((bone, i) => {
    const [x, y, z] = BONE_POS[bone];
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], i * 16);
  });
  skinDef.setInverseBindMatrices(
    doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer),
  );

  const skinned = (name: string, geometry: Geometry, color: [number, number, number]) => {
    const node = addMesh(doc, buffer, name, geometry, colorMaterial(doc, `${name}-mat`, color));
    const prim = node.getMesh()!.listPrimitives()[0]!;
    const joints = new Uint16Array(geometry.joints!.flatMap((v) => [v, 0, 0, 0]));
    const weights = new Float32Array(geometry.joints!.flatMap(() => [1, 0, 0, 0]));
    prim.setAttribute(
      "JOINTS_0",
      doc.createAccessor().setType("VEC4").setArray(joints).setBuffer(buffer),
    );
    prim.setAttribute(
      "WEIGHTS_0",
      doc.createAccessor().setType("VEC4").setArray(weights).setBuffer(buffer),
    );
    node.setSkin(skinDef);
    return node;
  };

  scene.addChild(root);
  scene.addChild(skinned("clothes", clothesGeometry, shirt));
  scene.addChild(skinned("skin", skinGeometry, skin));

  const quat = (axis: "x" | "z", angle: number): [number, number, number, number] => {
    const s = Math.sin(angle / 2);
    return axis === "x" ? [s, 0, 0, Math.cos(angle / 2)] : [0, 0, s, Math.cos(angle / 2)];
  };
  const clip = (name: string, duration: number, tracks: Record<string, [number, number][]>) => {
    const anim = doc.createAnimation(name);
    for (const [bone, keys] of Object.entries(tracks)) {
      const input = doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Float32Array(keys.map((_, i) => (i / (keys.length - 1)) * duration)))
        .setBuffer(buffer);
      const output = doc
        .createAccessor()
        .setType("VEC4")
        .setArray(
          new Float32Array(
            keys.flatMap(([angle, axisFlag]) => quat(axisFlag === 0 ? "x" : "z", angle)),
          ),
        )
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation("LINEAR");
      anim
        .addSampler(sampler)
        .addChannel(
          doc
            .createAnimationChannel()
            .setTargetNode(nodes.get(bone)!)
            .setTargetPath("rotation")
            .setSampler(sampler),
        );
    }
  };
  const swing = (amp: number): [number, number][] => [
    [0, 0],
    [amp, 0],
    [0, 0],
    [-amp, 0],
    [0, 0],
  ];
  const still = (angle: number): [number, number][] => [
    [angle, 0],
    [angle, 0],
  ];
  clip("idle", 2, {
    spine: [
      [0, 0],
      [0.03, 0],
      [0, 0],
    ],
  });
  clip("walk", 1, {
    thigh_l: swing(0.5),
    thigh_r: swing(-0.5),
    upper_arm_l: swing(-0.4),
    upper_arm_r: swing(0.4),
  });
  clip("run", 0.6, {
    thigh_l: swing(0.9),
    thigh_r: swing(-0.9),
    upper_arm_l: swing(-0.8),
    upper_arm_r: swing(0.8),
  });
  clip("ride_bicycle", 1, {
    thigh_l: swing(0.6),
    thigh_r: swing(-0.6),
    upper_arm_l: still(-0.6),
    upper_arm_r: still(-0.6),
  });
  clip("ride_motorbike", 1, {
    thigh_l: still(-1.2),
    thigh_r: still(-1.2),
    upper_arm_l: still(-0.8),
    upper_arm_r: still(-0.8),
  });
  clip("sit_car", 1, {
    thigh_l: still(-1.4),
    thigh_r: still(-1.4),
    shin_l: still(1.3),
    shin_r: still(1.3),
  });

  return toBytes(doc);
}

export interface VehicleSpec {
  kind: VehicleKind;
  length: number;
  width: number;
  height: number;
  color: number;
}

/** Xe placeholder với đủ node bắt buộc (mục 16.11), gốc ở mặt đất giữa hai trục, hướng +Z. */
export async function buildVehicleGlb(spec: VehicleSpec): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("scene");
  const { length: L, width: W, height: H, kind } = spec;
  const wheelR = kind === "car" ? 0.32 : kind === "motorbike" ? 0.3 : 0.34;
  const wheelW = kind === "car" ? 0.22 : 0.1;
  const bodyBottom = kind === "car" ? 0.28 : wheelR;

  const bodyGeometry = boxGeometry(
    [W, H - bodyBottom, L],
    [0, bodyBottom + (H - bodyBottom) / 2, 0],
  );
  const body = addMesh(
    doc,
    buffer,
    "body",
    bodyGeometry,
    colorMaterial(doc, "paint", [
      ((spec.color >> 16) & 255) / 255,
      ((spec.color >> 8) & 255) / 255,
      (spec.color & 255) / 255,
    ]),
  );
  scene.addChild(body);

  const tyre = colorMaterial(doc, "tyre", [0.1, 0.1, 0.1]);
  const zFront = L / 2 - wheelR - 0.05;
  const addWheel = (name: string, x: number, z: number) => {
    const node = addMesh(
      doc,
      buffer,
      name,
      wheelGeometry(wheelR, wheelW, [0, 0, 0]),
      tyre,
    ).setTranslation([x, wheelR, z]);
    body.addChild(node);
  };
  if (kind === "car") {
    const x = W / 2 - wheelW / 2;
    addWheel("wheel_fl", x, zFront);
    addWheel("wheel_fr", -x, zFront);
    addWheel("wheel_rl", x, -zFront);
    addWheel("wheel_rr", -x, -zFront);
  } else {
    addWheel("wheel_front", 0, zFront);
    addWheel("wheel_rear", 0, -zFront);
    body.addChild(doc.createNode("handlebar").setTranslation([0, H - 0.1, zFront * 0.7]));
  }
  body.addChild(
    doc
      .createNode("seat_driver")
      .setTranslation([
        kind === "car" ? 0.35 : 0,
        bodyBottom + (kind === "car" ? 0.45 : 0.55),
        kind === "car" ? 0.2 : -0.1,
      ]),
  );

  return toBytes(doc);
}

/** Khối hộp đơn giản (địa danh mẫu, props). */
export async function buildBoxesGlb(
  parts: {
    name: string;
    size: [number, number, number];
    center: [number, number, number];
    color: number;
  }[],
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("scene");
  for (const p of parts) {
    scene.addChild(
      addMesh(
        doc,
        buffer,
        p.name,
        boxGeometry(p.size, p.center),
        colorMaterial(doc, `${p.name}-mat`, rgb(p.color)),
      ),
    );
  }
  return toBytes(doc);
}
