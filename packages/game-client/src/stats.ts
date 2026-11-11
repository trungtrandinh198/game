/** Thu mẫu thời gian khung hình để tính FPS trung bình và FPS thấp nhất 5% (mục 17.5). */
export interface FrameStats {
  fps: number;
  /** FPS ở phân vị 95 của thời gian khung hình (5% khung chậm nhất). */
  fpsLow5: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface RenderInfoLike {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
}

export class StatsCollector {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 240) {
    this.capacity = capacity;
  }

  push(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.samples.push(frameMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  reset(): void {
    this.samples.length = 0;
  }

  get count(): number {
    return this.samples.length;
  }

  snapshot(info?: RenderInfoLike): FrameStats {
    const n = this.samples.length;
    if (n === 0) {
      return { fps: 0, fpsLow5: 0, frameMs: 0, calls: 0, triangles: 0, geometries: 0, textures: 0 };
    }
    const mean = this.samples.reduce((a, b) => a + b, 0) / n;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? mean;
    return {
      fps: 1000 / mean,
      fpsLow5: 1000 / p95,
      frameMs: mean,
      calls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
    };
  }
}
