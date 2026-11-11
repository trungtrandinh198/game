export type Segment = readonly [x1: number, z1: number, x2: number, z2: number];

/** Truy vấn đoạn thẳng gần một hình tròn (mục 8.9). */
export interface CollisionWorld {
  querySegments(x: number, z: number, radius: number): Segment[];
}

export function createCollisionWorld(
  segments: readonly Segment[],
  cellSize: number,
): CollisionWorld {
  const cells = new Map<number, Map<number, number[]>>();
  const stamp = new Uint32Array(segments.length);
  let currentStamp = 0;

  const cellOf = (v: number) => Math.floor(v / cellSize);

  segments.forEach((seg, index) => {
    const minCx = cellOf(Math.min(seg[0], seg[2]));
    const maxCx = cellOf(Math.max(seg[0], seg[2]));
    const minCz = cellOf(Math.min(seg[1], seg[3]));
    const maxCz = cellOf(Math.max(seg[1], seg[3]));
    for (let cx = minCx; cx <= maxCx; cx++) {
      let column = cells.get(cx);
      if (!column) {
        column = new Map();
        cells.set(cx, column);
      }
      for (let cz = minCz; cz <= maxCz; cz++) {
        const list = column.get(cz);
        if (list) list.push(index);
        else column.set(cz, [index]);
      }
    }
  });

  return {
    querySegments(x, z, radius) {
      currentStamp++;
      const out: Segment[] = [];
      const minCx = cellOf(x - radius);
      const maxCx = cellOf(x + radius);
      const minCz = cellOf(z - radius);
      const maxCz = cellOf(z + radius);
      for (let cx = minCx; cx <= maxCx; cx++) {
        const column = cells.get(cx);
        if (!column) continue;
        for (let cz = minCz; cz <= maxCz; cz++) {
          const list = column.get(cz);
          if (!list) continue;
          for (const index of list) {
            if (stamp[index] === currentStamp) continue;
            stamp[index] = currentStamp;
            const seg = segments[index];
            if (seg) out.push(seg);
          }
        }
      }
      return out;
    },
  };
}

function orientation(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  return Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
}

/** Hai đoạn thẳng cắt nhau (bỏ qua trường hợp chỉ chạm đầu mút thẳng hàng). */
export function segmentsIntersect(a: Segment, b: Segment): boolean {
  const o1 = orientation(a[0], a[1], a[2], a[3], b[0], b[1]);
  const o2 = orientation(a[0], a[1], a[2], a[3], b[2], b[3]);
  const o3 = orientation(b[0], b[1], b[2], b[3], a[0], a[1]);
  const o4 = orientation(b[0], b[1], b[2], b[3], a[2], a[3]);
  return o1 !== o2 && o3 !== o4;
}

/** Đường thẳng từ (x1, z1) tới (x2, z2) có cắt vật cản nào không. */
export function pathBlocked(
  world: CollisionWorld,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): boolean {
  const radius = Math.hypot(x2 - x1, z2 - z1) / 2 + 0.01;
  const path: Segment = [x1, z1, x2, z2];
  return world
    .querySegments((x1 + x2) / 2, (z1 + z2) / 2, radius)
    .some((seg) => segmentsIntersect(path, seg));
}

export interface CircleResolution {
  x: number;
  z: number;
  hit: boolean;
  /** Pháp tuyến trung bình của các va chạm (độ dài 1 khi hit). */
  nx: number;
  nz: number;
}

/** Đẩy hình tròn ra khỏi các đoạn thẳng; trượt dọc cạnh nhờ chỉ loại bỏ phần xuyên vào. */
export function resolveCircle(
  world: CollisionWorld,
  x: number,
  z: number,
  radius: number,
  iterations = 4,
): CircleResolution {
  let px = x;
  let pz = z;
  let hit = false;
  let nx = 0;
  let nz = 0;

  for (let i = 0; i < iterations; i++) {
    let moved = false;
    for (const seg of world.querySegments(px, pz, radius)) {
      const [x1, z1, x2, z2] = seg;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
      const cx = x1 + t * dx;
      const cz = z1 + t * dz;
      let ox = px - cx;
      let oz = pz - cz;
      const dist = Math.hypot(ox, oz);
      if (dist >= radius) continue;

      if (dist < 1e-9) {
        const len = Math.sqrt(len2) || 1;
        ox = -dz / len;
        oz = dx / len;
      } else {
        ox /= dist;
        oz /= dist;
      }
      const push = radius - dist;
      px += ox * push;
      pz += oz * push;
      nx += ox;
      nz += oz;
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }

  if (hit) {
    const nl = Math.hypot(nx, nz);
    if (nl > 1e-9) {
      nx /= nl;
      nz /= nl;
    }
  }
  return { x: px, z: pz, hit, nx, nz };
}
