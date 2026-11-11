import type { Buffer as GltfBuffer, Document, Material, Node } from "@gltf-transform/core";

export interface Geometry {
  positions: number[];
  normals: number[];
  indices: number[];
  /** Chỉ số khớp (joint) của từng đỉnh, dùng cho mesh có skin. */
  joints?: number[];
}

/** Hộp có tâm ở `center`; mỗi mặt có pháp tuyến riêng. */
export function boxGeometry(
  size: [number, number, number],
  center: [number, number, number],
  joint?: number,
): Geometry {
  const [sx, sy, sz] = size.map((v) => v / 2) as [number, number, number];
  const [cx, cy, cz] = center;
  const faces: { n: [number, number, number]; v: [number, number, number][] }[] = [
    {
      n: [1, 0, 0],
      v: [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
    },
    {
      n: [0, 1, 0],
      v: [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
    },
    {
      n: [0, 0, 1],
      v: [
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
        [-1, -1, 1],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
    },
  ];
  const g: Geometry = {
    positions: [],
    normals: [],
    indices: [],
    ...(joint !== undefined ? { joints: [] } : {}),
  };
  for (const f of faces) {
    const base = g.positions.length / 3;
    for (const [x, y, z] of f.v) {
      g.positions.push(cx + x * sx, cy + y * sy, cz + z * sz);
      g.normals.push(...f.n);
      g.joints?.push(joint!);
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}

/** Trụ có trục dọc theo X (bánh xe), tâm ở `center`. */
export function wheelGeometry(
  radius: number,
  width: number,
  center: [number, number, number],
  segments = 12,
): Geometry {
  const [cx, cy, cz] = center;
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const quad = [
      [-width / 2, Math.cos(a0) * radius, Math.sin(a0) * radius],
      [width / 2, Math.cos(a0) * radius, Math.sin(a0) * radius],
      [width / 2, Math.cos(a1) * radius, Math.sin(a1) * radius],
      [-width / 2, Math.cos(a1) * radius, Math.sin(a1) * radius],
    ] as const;
    const am = (a0 + a1) / 2;
    const base = g.positions.length / 3;
    for (const [x, y, z] of quad) {
      g.positions.push(cx + x, cy + y, cz + z);
      g.normals.push(0, Math.cos(am), Math.sin(am));
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    for (const side of [-1, 1]) {
      const b2 = g.positions.length / 3;
      g.positions.push(cx + (side * width) / 2, cy, cz);
      g.normals.push(side, 0, 0);
      for (const a of [a0, a1]) {
        g.positions.push(
          cx + (side * width) / 2,
          cy + Math.cos(a) * radius,
          cz + Math.sin(a) * radius,
        );
        g.normals.push(side, 0, 0);
      }
      g.indices.push(...(side > 0 ? [b2, b2 + 1, b2 + 2] : [b2, b2 + 2, b2 + 1]));
    }
  }
  return g;
}

export function mergeGeometry(parts: Geometry[]): Geometry {
  const out: Geometry = { positions: [], normals: [], indices: [] };
  const withJoints = parts.every((p) => p.joints);
  if (withJoints) out.joints = [];
  for (const p of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...p.positions);
    out.normals.push(...p.normals);
    out.indices.push(...p.indices.map((i) => i + base));
    if (withJoints) out.joints!.push(...p.joints!);
  }
  return out;
}

export function addMesh(
  doc: Document,
  buffer: GltfBuffer,
  name: string,
  geometry: Geometry,
  material: Material,
): Node {
  const accessor = (
    type: "VEC3" | "SCALAR",
    array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(geometry.positions)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(geometry.normals)))
    .setIndices(accessor("SCALAR", new Uint16Array(geometry.indices)))
    .setMaterial(material);
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
}

export function colorMaterial(
  doc: Document,
  name: string,
  rgb: [number, number, number],
): Material {
  return doc
    .createMaterial(name)
    .setBaseColorFactor([...rgb, 1])
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0);
}
