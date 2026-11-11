import ClipperLib from "clipper-lib";
import earcut from "earcut";

export type Pt = [number, number];
export type Ring = Pt[];
export type Poly = Ring[];
export type MultiPoly = Poly[];

/** Clipper làm việc với số nguyên: 1 đơn vị = 1 mm. */
const SCALE = 1000;
type CPath = { X: number; Y: number }[];

const toPath = (ring: readonly Pt[]): CPath => {
  const pts =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring;
  return pts.map(([x, z]) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) }));
};
const fromPath = (path: CPath): Ring => {
  const r = path.map((p) => [p.X / SCALE, p.Y / SCALE] as Pt);
  return [...r, r[0]!];
};

/** Vòng ngoài hướng dương, lỗ hướng âm để dùng fill rule NonZero khi gộp nhiều polygon. */
function addPolys(
  clipper: { AddPaths(p: CPath[], t: number, closed: boolean): boolean },
  mp: MultiPoly,
  type: number,
): void {
  for (const poly of mp) {
    const paths = poly.map((ring, i) => {
      const path = toPath(ring);
      const positive = ClipperLib.Clipper.Orientation(path);
      if ((i === 0) !== positive) path.reverse();
      return path;
    });
    clipper.AddPaths(paths, type, true);
  }
}

function fromTree(tree: { Childs(): TreeNode[] }): MultiPoly {
  const out: MultiPoly = [];
  const visit = (node: TreeNode) => {
    if (!node.IsHole()) {
      const holes = node.Childs().map((h) => h.Contour());
      out.push([fromPath(node.Contour()), ...holes.map(fromPath)].filter((r) => r.length >= 4));
      for (const h of node.Childs()) h.Childs().forEach(visit);
    }
  };
  tree.Childs().forEach(visit);
  return out.filter((p) => p.length > 0 && p[0]!.length >= 4);
}
interface TreeNode {
  IsHole(): boolean;
  Contour(): CPath;
  Childs(): TreeNode[];
}

function execute(op: number, subject: MultiPoly, clip: MultiPoly): MultiPoly {
  const c = new ClipperLib.Clipper();
  addPolys(c, subject, ClipperLib.PolyType.ptSubject);
  addPolys(c, clip, ClipperLib.PolyType.ptClip);
  const tree = new ClipperLib.PolyTree();
  c.Execute(op, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromTree(tree);
}

export const union = (...p: MultiPoly[]): MultiPoly => {
  const all = p.flat();
  return all.length === 0 ? [] : execute(ClipperLib.ClipType.ctUnion, all, []);
};
export const intersection = (a: MultiPoly, b: MultiPoly): MultiPoly =>
  a.length === 0 || b.length === 0 ? [] : execute(ClipperLib.ClipType.ctIntersection, a, b);
export const difference = (a: MultiPoly, b: MultiPoly): MultiPoly =>
  a.length === 0 ? [] : b.length === 0 ? union(a) : execute(ClipperLib.ClipType.ctDifference, a, b);

export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const boxPoly = (b: Box): MultiPoly => [
  [
    [
      [b.minX, b.minZ],
      [b.maxX, b.minZ],
      [b.maxX, b.maxZ],
      [b.minX, b.maxZ],
      [b.minX, b.minZ],
    ],
  ],
];

export function ringBox(r: readonly Pt[]): Box {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const [x, z] of r) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

export function multiBox(mp: MultiPoly): Box {
  const boxes = mp.map((p) => ringBox(p[0] ?? []));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

export const boxesOverlap = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Diện tích có dấu của vòng đóng (dương khi ngược chiều kim đồng hồ trong hệ (x, z) với x sang phải, z lên). */
export function signedArea(ring: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++)
    s += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return s / 2;
}

export function polyArea(p: Poly): number {
  return (
    Math.abs(signedArea(p[0] ?? [])) - p.slice(1).reduce((a, h) => a + Math.abs(signedArea(h)), 0)
  );
}

export function centroid(ring: readonly Pt[]): Pt {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length - 1);
    return [
      ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n,
      ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  let cx = 0,
    cz = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, z0] = ring[i]!;
    const [x1, z1] = ring[i + 1]!;
    const f = x0 * z1 - x1 * z0;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

function ringContains(x: number, z: number, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const polyContains = (x: number, z: number, p: Poly) =>
  p[0] !== undefined && ringContains(x, z, p[0]) && !p.slice(1).some((h) => ringContains(x, z, h));

export const multiContains = (x: number, z: number, mp: MultiPoly) =>
  mp.some((p) => polyContains(x, z, p));

/** Douglas–Peucker cho vòng đóng; giữ ít nhất 4 điểm. */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const pts = ring.slice(0, -1);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
  };
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let max = 0,
      idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = dist(pts[i]!, pts[s]!, pts[e]!);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx >= 0 && max > tolerance) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (out.length < 3) return ring;
  return [...out, out[0]!];
}

/** Dải polyline mở rộng theo `width`, đầu cụt, khớp nối vát (Clipper offset trên đường mở). */
export function bufferLine(line: readonly Pt[], width: number): MultiPoly {
  const path = toPath(
    line.filter(
      (p, i) => i === 0 || Math.hypot(p[0] - line[i - 1]![0], p[1] - line[i - 1]![1]) > 1e-4,
    ),
  );
  if (path.length < 2) return [];
  const co = new ClipperLib.ClipperOffset(2, 0.25 * SCALE);
  co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etOpenButt);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, (width / 2) * SCALE);
  return fromTree(tree);
}

/** Tam giác hóa một polygon (kèm lỗ); trả chỉ số vào mảng đỉnh phẳng [x, z, ...]. */
export function triangulate(p: Poly): { vertices: number[]; indices: number[] } {
  const vertices: number[] = [];
  const holes: number[] = [];
  p.forEach((ring, i) => {
    if (i > 0) holes.push(vertices.length / 2);
    for (const [x, z] of ring.slice(0, -1)) vertices.push(x, z);
  });
  return { vertices, indices: earcut(vertices, holes, 2) };
}

/** Làm sạch vòng: bỏ điểm trùng liên tiếp, đảm bảo đóng kín. */
export function cleanRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6)
      out.push([p[0], p[1]]);
  }
  const first = out[0];
  const end = out[out.length - 1];
  if (first && end && (first[0] !== end[0] || first[1] !== end[1])) out.push([first[0], first[1]]);
  return out;
}
