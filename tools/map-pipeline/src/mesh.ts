import { signedArea, triangulate, type MultiPoly, type Poly } from "./geom";

export interface MeshBuilder {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

export const newMesh = (): MeshBuilder => ({ positions: [], normals: [], colors: [], indices: [] });

type Rgb = readonly [number, number, number];

function pushVertex(
  m: MeshBuilder,
  x: number,
  y: number,
  z: number,
  n: readonly [number, number, number],
  c: Rgb,
): number {
  m.positions.push(x, y, z);
  m.normals.push(n[0], n[1], n[2]);
  m.colors.push(c[0], c[1], c[2], 255);
  return m.positions.length / 3 - 1;
}

/** Mặt phẳng nằm ngang ở độ cao `y`, pháp tuyến +Y (tam giác quay ngược chiều kim đồng hồ khi nhìn từ trên xuống). */
export function addFlat(m: MeshBuilder, mp: MultiPoly, y: number, color: Rgb): void {
  for (const poly of mp) {
    const { vertices, indices } = triangulate(poly);
    if (indices.length === 0) continue;
    const base = m.positions.length / 3;
    for (let i = 0; i < vertices.length; i += 2)
      pushVertex(m, vertices[i]!, y, vertices[i + 1]!, [0, 1, 0], color);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!,
        b = indices[i + 1]!,
        c = indices[i + 2]!;
      const [ax, az, bx, bz, cx, cz] = [
        vertices[a * 2]!,
        vertices[a * 2 + 1]!,
        vertices[b * 2]!,
        vertices[b * 2 + 1]!,
        vertices[c * 2]!,
        vertices[c * 2 + 1]!,
      ];
      // pháp tuyến Y của (b - a) x (c - a) phải dương
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny >= 0) m.indices.push(base + a, base + b, base + c);
      else m.indices.push(base + a, base + c, base + b);
    }
  }
}

/** Khối nhà: tường từ y = 0 tới `height` và mái phẳng. */
export function addExtrusion(
  m: MeshBuilder,
  poly: Poly,
  height: number,
  wall: Rgb,
  roof: Rgb,
): void {
  poly.forEach((ring, ringIndex) => {
    // Vòng ngoài hướng pháp tuyến ra ngoài, lỗ thì hướng vào trong lỗ (ra khỏi vật liệu).
    const ccw = signedArea(ring) > 0;
    const outward = ringIndex === 0 ? ccw : !ccw;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, z0] = ring[i]!;
      const [x1, z1] = ring[i + 1]!;
      const dx = x1 - x0,
        dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      // Với (x phải, z xuống) vòng "ccw" theo công thức signedArea có pháp tuyến ngoài là (dz, -dx).
      const sign = outward ? 1 : -1;
      const n: [number, number, number] = [(dz / len) * sign, 0, (-dx / len) * sign];
      const base = m.positions.length / 3;
      pushVertex(m, x0, 0, z0, n, wall);
      pushVertex(m, x1, 0, z1, n, wall);
      pushVertex(m, x1, height, z1, n, wall);
      pushVertex(m, x0, height, z0, n, wall);
      // Tường quay pháp tuyến hình học về phía n.
      const nx = n[0],
        nz = n[2];
      const cross = faceNormal([x0, 0, z0], [x1, 0, z1], [x1, height, z1]);
      if (cross[0] * nx + cross[2] * nz >= 0)
        m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else m.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  });
  addFlat(m, [poly], height, roof);
}

function faceNormal(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
): [number, number, number] {
  const ux = b[0]! - a[0]!,
    uy = b[1]! - a[1]!,
    uz = b[2]! - a[2]!;
  const vx = c[0]! - a[0]!,
    vy = c[1]! - a[1]!,
    vz = c[2]! - a[2]!;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

export const triangleCount = (m: MeshBuilder) => m.indices.length / 3;
