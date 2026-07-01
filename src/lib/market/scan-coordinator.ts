import type {
  ScanCoordinationClaim,
  ScanCoordinator,
} from "./scan-runtime";
import type { MarketDataProvider, ScanRuntimeDiagnostics } from "./types";

export type ScanCoordinatorOptions = {
  coinGlassMinuteLimit: number;
  estimatedCoinGlassRequests: number;
  lockTtlMs: number;
};

type ActiveLock = {
  expiresAtMs: number;
  token: string;
};

type MinuteBucket = {
  count: number;
  expiresAtMs: number;
};

export type RedisScanCoordinatorClient = {
  connect?: () => Promise<unknown>;
  decrBy: (key: string, amount: number) => Promise<number>;
  del: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<boolean | number>;
  get: (key: string) => Promise<string | null>;
  incrBy: (key: string, amount: number) => Promise<number>;
  isOpen?: boolean;
  set: (
    key: string,
    value: string,
    options: { NX?: boolean; PX?: number },
  ) => Promise<"OK" | null | string>;
};

type BeforeScanContext = {
  cadenceMinutes: 15 | 30;
  forceRefresh: boolean;
  now: Date;
  providerId: MarketDataProvider["id"];
  trigger: ScanRuntimeDiagnostics["trigger"];
};

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function lockKey(context: BeforeScanContext) {
  return `scan:${context.providerId}`;
}

function redisLockKey(context: BeforeScanContext) {
  return `scan:lock:${context.providerId}`;
}

function minuteKey(date: Date) {
  const minute = new Date(date);
  minute.setUTCSeconds(0, 0);

  return minute.toISOString();
}

function redisMinuteKey(date: Date) {
  return `scan:coinglass:minute:${minuteKey(date)}`;
}

function tokenFor(context: BeforeScanContext) {
  return `${context.trigger}:${context.now.getTime()}:${Math.random().toString(36).slice(2)}`;
}

function expired(expiresAtMs: number, nowMs: number) {
  return expiresAtMs <= nowMs;
}

export function createMemoryScanCoordinator({
  coinGlassMinuteLimit,
  estimatedCoinGlassRequests,
  lockTtlMs,
}: ScanCoordinatorOptions): ScanCoordinator {
  const locks = new Map<string, ActiveLock>();
  const minuteBuckets = new Map<string, MinuteBucket>();

  function cleanup(nowMs: number) {
    for (const [key, lock] of locks.entries()) {
      if (expired(lock.expiresAtMs, nowMs)) {
        locks.delete(key);
      }
    }

    for (const [key, bucket] of minuteBuckets.entries()) {
      if (expired(bucket.expiresAtMs, nowMs)) {
        minuteBuckets.delete(key);
      }
    }
  }

  return {
    async beforeScan(context): Promise<ScanCoordinationClaim> {
      const nowMs = context.now.getTime();
      const key = lockKey(context);

      cleanup(nowMs);

      if (locks.has(key)) {
        return {
          allowed: false,
          reason: `${context.providerId} scan already running`,
        };
      }

      const token = tokenFor(context);
      locks.set(key, {
        expiresAtMs: nowMs + lockTtlMs,
        token,
      });

      if (context.providerId === "coinglass") {
        const bucketKey = minuteKey(context.now);
        const bucket = minuteBuckets.get(bucketKey) ?? {
          count: 0,
          expiresAtMs: nowMs + 60_000,
        };
        const nextCount = bucket.count + estimatedCoinGlassRequests;

        if (nextCount > coinGlassMinuteLimit) {
          locks.delete(key);

          return {
            allowed: false,
            reason:
              `coinglass minute budget exhausted: requested ${nextCount}/${coinGlassMinuteLimit} calls in this minute`,
          };
        }

        bucket.count = nextCount;
        minuteBuckets.set(bucketKey, bucket);
      }

      return {
        allowed: true,
        token,
      };
    },

    async afterScan(token) {
      for (const [key, lock] of locks.entries()) {
        if (lock.token === token) {
          locks.delete(key);
          return;
        }
      }
    },
  };
}

async function ensureRedisConnected(client: RedisScanCoordinatorClient) {
  if (client.connect && !client.isOpen) {
    await client.connect();
  }
}

export function createRedisScanCoordinatorFromClient(
  client: RedisScanCoordinatorClient,
  {
    coinGlassMinuteLimit,
    estimatedCoinGlassRequests,
    lockTtlMs,
  }: ScanCoordinatorOptions,
): ScanCoordinator {
  return {
    async beforeScan(context): Promise<ScanCoordinationClaim> {
      await ensureRedisConnected(client);

      const key = redisLockKey(context);
      const token = tokenFor(context);
      const lockResult = await client.set(key, token, {
        NX: true,
        PX: lockTtlMs,
      });

      if (lockResult !== "OK") {
        return {
          allowed: false,
          reason: `${context.providerId} scan already running`,
        };
      }

      if (context.providerId === "coinglass") {
        const bucketKey = redisMinuteKey(context.now);
        const nextCount = await client.incrBy(bucketKey, estimatedCoinGlassRequests);
        await client.expire(bucketKey, 90);

        if (nextCount > coinGlassMinuteLimit) {
          await client.decrBy(bucketKey, estimatedCoinGlassRequests);
          await releaseRedisLock(client, key, token);

          return {
            allowed: false,
            reason:
              `coinglass minute budget exhausted: requested ${nextCount}/${coinGlassMinuteLimit} calls in this minute`,
          };
        }
      }

      return {
        allowed: true,
        token,
      };
    },

    async afterScan(token) {
      await ensureRedisConnected(client);
      await releaseRedisLock(client, "scan:lock:coinglass", token);
      await releaseRedisLock(client, "scan:lock:mock", token);
      await releaseRedisLock(client, "scan:lock:exchange_public", token);
      await releaseRedisLock(client, "scan:lock:coingecko", token);
      await releaseRedisLock(client, "scan:lock:composite", token);
    },
  };
}

async function releaseRedisLock(client: RedisScanCoordinatorClient, key: string, token: string) {
  const current = await client.get(key);

  if (current === token) {
    await client.del(key);
  }
}

export type ScanCoordinatorEnv = {
  COINGLASS_BATCH_SIZE?: string;
  COINGLASS_MINUTE_REQUEST_LIMIT?: string;
  REDIS_URL?: string;
  SCAN_LOCK_TTL_SECONDS?: string;
  [key: string]: string | undefined;
};

export function createFailoverScanCoordinator({
  fallback,
  primary,
}: {
  fallback: ScanCoordinator;
  primary: () => Promise<ScanCoordinator>;
}): ScanCoordinator {
  return {
    async beforeScan(context) {
      try {
        return await (await primary()).beforeScan(context);
      } catch {
        return fallback.beforeScan(context);
      }
    },

    async afterScan(token, context) {
      try {
        await (await primary()).afterScan(token, context);
      } catch {
        // Redis is best effort here; the fallback lock still must be released.
      } finally {
        await fallback.afterScan(token, context);
      }
    },
  };
}

export function createScanCoordinatorFromEnv(env: ScanCoordinatorEnv = process.env): ScanCoordinator {
  const options = {
    coinGlassMinuteLimit: positiveInt(env.COINGLASS_MINUTE_REQUEST_LIMIT, 30),
    estimatedCoinGlassRequests: positiveInt(env.COINGLASS_BATCH_SIZE, 24),
    lockTtlMs: positiveInt(env.SCAN_LOCK_TTL_SECONDS, 600) * 1_000,
  };
  const memoryCoordinator = createMemoryScanCoordinator(options);

  if (!env.REDIS_URL) {
    return memoryCoordinator;
  }

  let redisCoordinatorPromise: Promise<ScanCoordinator> | null = null;

  async function redisCoordinator() {
    redisCoordinatorPromise ??= import("redis")
      .then(({ createClient }) => {
        const client = createClient({ url: env.REDIS_URL }) as unknown as RedisScanCoordinatorClient;

        return createRedisScanCoordinatorFromClient(client, options);
      });

    return redisCoordinatorPromise;
  }

  return createFailoverScanCoordinator({
    fallback: memoryCoordinator,
    primary: redisCoordinator,
  });
}
