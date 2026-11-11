export interface Sample {
  /** Thời điểm nhận (ms). */
  t: number;
  x: number;
  z: number;
  rotY: number;
  speed: number;
  steer: number;
}

/** Nội suy góc theo cung ngắn nhất để không quay vòng dài qua đường nối ±π. */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/** Bộ đệm snapshot của một thực thể ở xa; render chậm hơn thực tế một khoảng để luôn có hai mẫu bao quanh. */
export class SnapshotBuffer {
  private readonly samples: Sample[] = [];

  constructor(private readonly capacity = 30) {}

  push(sample: Sample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && sample.t <= last.t) return;
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get latest(): Sample | undefined {
    return this.samples[this.samples.length - 1];
  }

  get size(): number {
    return this.samples.length;
  }

  /** Mẫu tại `renderTime`: nội suy giữa hai mẫu bao quanh; trước mẫu đầu/sau mẫu cuối thì giữ nguyên. */
  sample(renderTime: number): Sample | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const first = this.samples[0]!;
    const last = this.samples[n - 1]!;
    if (renderTime <= first.t) return first;
    if (renderTime >= last.t) return last;
    for (let i = n - 1; i > 0; i--) {
      const b = this.samples[i]!;
      const a = this.samples[i - 1]!;
      if (renderTime >= a.t) {
        const k = (renderTime - a.t) / (b.t - a.t);
        return {
          t: renderTime,
          x: a.x + (b.x - a.x) * k,
          z: a.z + (b.z - a.z) * k,
          rotY: lerpAngle(a.rotY, b.rotY, k),
          speed: a.speed + (b.speed - a.speed) * k,
          steer: a.steer + (b.steer - a.steer) * k,
        };
      }
    }
    return last;
  }
}
