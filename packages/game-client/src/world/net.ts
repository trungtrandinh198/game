/** Chạy tối đa `limit` tác vụ cùng lúc (mục 16.10: 4 request đồng thời). */
export class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Thử lại với backoff lũy thừa; ném lỗi cuối cùng sau khi hết lượt. */
export async function withRetry<T>(
  task: () => Promise<T>,
  { retries, baseDelayMs, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: RetryOptions,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (e) {
      last = e;
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw last;
}
