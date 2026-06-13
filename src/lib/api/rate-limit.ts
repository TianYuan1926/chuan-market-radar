export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  windowStart: number;
};

export class MemoryRateLimiter {
  private buckets = new Map<string, Bucket>();
  private limit: number;
  private windowMs: number;

  constructor({ limit, windowMs }: RateLimitOptions) {
    this.limit = Math.max(1, Math.floor(limit));
    this.windowMs = Math.max(1, Math.floor(windowMs));
  }

  consume(key: string, now = new Date()): RateLimitResult {
    const nowMs = now.getTime();
    const current = this.buckets.get(key);
    const bucket = current && nowMs - current.windowStart < this.windowMs
      ? current
      : { count: 0, windowStart: nowMs };

    if (bucket.count >= this.limit) {
      this.buckets.set(key, bucket);

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(bucket.windowStart + this.windowMs).toISOString(),
      };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: new Date(bucket.windowStart + this.windowMs).toISOString(),
    };
  }
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "x-ratelimit-remaining": result.remaining.toString(),
    "x-ratelimit-reset": result.resetAt,
  };
}
