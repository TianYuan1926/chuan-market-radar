export type ApiObservabilityRedisClient = {
  connect?: () => Promise<unknown>;
  expire: (key: string, seconds: number) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  incrBy?: (key: string, increment: number) => Promise<number>;
  isOpen?: boolean;
  quit?: () => Promise<unknown>;
  set: (key: string, value: string, options?: Record<string, unknown>) => Promise<unknown>;
};

export type ApiObservabilityEnv = Record<string, string | undefined>;

export type ApiUsageReport = {
  dailyBudget: number;
  day: string;
  detail: string;
  generatedAt: string;
  pacingMs: number;
  perMinuteLimit: number;
  provider: "CoinGlass";
  remainingToday: number;
  source: "redis" | "unconfigured" | "unavailable";
  status: "ready" | "unconfigured" | "unavailable";
  throttled: boolean;
  usedToday: number;
};

export type DataSourceLatencyProbeName = "CoinGlass" | "Binance" | "OKX" | "Bybit";

export type DataSourceLatencyProbe = {
  checkedAt: string | null;
  detail: string;
  latencyMs: number | null;
  name: DataSourceLatencyProbeName;
  source: "redis" | "unconfigured" | "unavailable";
  status: "ready" | "partial" | "unconfigured" | "unavailable";
};

export type DataSourceLatencyReport = {
  generatedAt: string;
  probes: DataSourceLatencyProbe[];
  status: "ready" | "partial" | "unconfigured" | "unavailable";
};

export type ApiObservabilityReport = {
  apiUsage: ApiUsageReport;
  dataSourceLatency: DataSourceLatencyReport;
};

const apiUsagePrefix = "chuan:api-usage:coinglass:";
const latencyPrefix = "chuan:data-source-latency:";
const latencyTtlSeconds = 60 * 60 * 24;
const apiUsageTtlSeconds = 60 * 60 * 72;
const defaultDailyBudget = 3_000;
const defaultMinuteLimit = 30;
const defaultPacingMs = 2_200;

const latencySources = [
  { id: "coinglass", name: "CoinGlass" },
  { id: "binance", name: "Binance" },
  { id: "okx", name: "OKX" },
  { id: "bybit", name: "Bybit" },
] as const;

type LatencySourceId = typeof latencySources[number]["id"];

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function usageKey(date: Date) {
  return `${apiUsagePrefix}${dayKey(date)}`;
}

function normalizeSource(value: string): LatencySourceId | null {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("coinglass")) return "coinglass";
  if (normalized.includes("binance")) return "binance";
  if (normalized.includes("okx")) return "okx";
  if (normalized.includes("bybit")) return "bybit";

  return null;
}

function latencyKey(source: LatencySourceId) {
  return `${latencyPrefix}${source}`;
}

async function ensureConnected(client: ApiObservabilityRedisClient) {
  if (client.connect && !client.isOpen) {
    await client.connect();
  }
}

function envHasRedis(env: ApiObservabilityEnv) {
  return Boolean(env.REDIS_URL?.trim());
}

function dailyBudget(env: ApiObservabilityEnv) {
  return positiveInt(env.COINGLASS_DAILY_REQUEST_BUDGET, defaultDailyBudget);
}

function minuteLimit(env: ApiObservabilityEnv) {
  return positiveInt(env.COINGLASS_MINUTE_REQUEST_LIMIT, defaultMinuteLimit);
}

function pacingMs(env: ApiObservabilityEnv) {
  return positiveInt(env.COINGLASS_REQUEST_INTERVAL_MS, defaultPacingMs);
}

async function incrementBy(client: ApiObservabilityRedisClient, key: string, count: number) {
  const safeCount = Math.max(1, Math.floor(count));

  if (client.incrBy) {
    return client.incrBy(key, safeCount);
  }

  let value = 0;
  for (let index = 0; index < safeCount; index += 1) {
    value = await client.incr(key);
  }

  return value;
}

export async function recordCoinGlassApiRequest(
  client: ApiObservabilityRedisClient,
  {
    count = 1,
    now = new Date(),
  }: {
    count?: number;
    now?: Date;
  } = {},
) {
  await ensureConnected(client);

  const key = usageKey(now);
  const value = await incrementBy(client, key, count);
  await client.expire(key, apiUsageTtlSeconds);

  return {
    day: dayKey(now),
    key,
    usedToday: value,
  };
}

export async function recordDataSourceLatency(
  client: ApiObservabilityRedisClient,
  {
    checkedAt = new Date().toISOString(),
    elapsedMs,
    source,
  }: {
    checkedAt?: string;
    elapsedMs: number;
    source: string;
  },
) {
  const normalizedSource = normalizeSource(source);

  if (!normalizedSource) {
    return {
      ok: false,
      reason: "unknown_source",
    } as const;
  }

  await ensureConnected(client);

  const safeElapsedMs = Math.max(0, Math.round(elapsedMs));
  await client.set(
    latencyKey(normalizedSource),
    JSON.stringify({
      checkedAt,
      elapsedMs: safeElapsedMs,
      source: normalizedSource,
    }),
    { EX: latencyTtlSeconds },
  );

  return {
    key: latencyKey(normalizedSource),
    ok: true,
  } as const;
}

function unavailableApiUsage(env: ApiObservabilityEnv, now: Date, detail: string): ApiUsageReport {
  const budget = dailyBudget(env);

  return {
    dailyBudget: budget,
    day: dayKey(now),
    detail,
    generatedAt: now.toISOString(),
    pacingMs: pacingMs(env),
    perMinuteLimit: minuteLimit(env),
    provider: "CoinGlass",
    remainingToday: budget,
    source: envHasRedis(env) ? "unavailable" : "unconfigured",
    status: envHasRedis(env) ? "unavailable" : "unconfigured",
    throttled: false,
    usedToday: 0,
  };
}

function missingLatencyProbe(
  name: DataSourceLatencyProbeName,
  source: "unconfigured" | "unavailable" | "redis",
  detail: string,
): DataSourceLatencyProbe {
  return {
    checkedAt: null,
    detail,
    latencyMs: null,
    name,
    source,
    status: source === "redis" ? "partial" : source,
  };
}

function unavailableLatencyReport(
  env: ApiObservabilityEnv,
  now: Date,
  detail: string,
): DataSourceLatencyReport {
  const source = envHasRedis(env) ? "unavailable" : "unconfigured";

  return {
    generatedAt: now.toISOString(),
    probes: latencySources.map((item) => missingLatencyProbe(item.name, source, detail)),
    status: source,
  };
}

function parseLatencyProbe(
  name: DataSourceLatencyProbeName,
  raw: string | null,
): DataSourceLatencyProbe {
  if (!raw) {
    return missingLatencyProbe(name, "redis", "Redis 中还没有该数据源延迟探针。");
  }

  try {
    const parsed = JSON.parse(raw) as Partial<{
      checkedAt: string;
      elapsedMs: number;
    }>;
    const latencyMs = typeof parsed.elapsedMs === "number" && Number.isFinite(parsed.elapsedMs)
      ? Math.max(0, Math.round(parsed.elapsedMs))
      : null;

    if (!parsed.checkedAt || latencyMs === null) {
      return missingLatencyProbe(name, "redis", "该数据源延迟探针格式不可用。");
    }

    return {
      checkedAt: parsed.checkedAt,
      detail: `${name} elapsedMs recorded.`,
      latencyMs,
      name,
      source: "redis",
      status: "ready",
    };
  } catch {
    return missingLatencyProbe(name, "redis", "该数据源延迟探针 JSON 解析失败。");
  }
}

export async function readApiObservabilityReport({
  client,
  env = {},
  now = new Date(),
}: {
  client?: ApiObservabilityRedisClient | null;
  env?: ApiObservabilityEnv;
  now?: Date;
}): Promise<ApiObservabilityReport> {
  if (!client && !envHasRedis(env)) {
    return {
      apiUsage: unavailableApiUsage(env, now, "REDIS_URL 未配置，不能读取 CoinGlass 日内真实调用计数。"),
      dataSourceLatency: unavailableLatencyReport(env, now, "REDIS_URL 未配置，不能读取数据源延迟探针。"),
    };
  }

  if (!client) {
    return {
      apiUsage: unavailableApiUsage(env, now, "未提供 Redis client，跳过 CoinGlass 日内真实调用计数。"),
      dataSourceLatency: unavailableLatencyReport(env, now, "未提供 Redis client，跳过数据源延迟探针。"),
    };
  }

  try {
    await ensureConnected(client);

    const budget = dailyBudget(env);
    const rawUsed = await client.get(usageKey(now));
    const usedToday = Math.max(0, positiveInt(rawUsed ?? "0", 0));
    const remainingToday = Math.max(0, budget - usedToday);
    const probes = await Promise.all(
      latencySources.map(async (item) => parseLatencyProbe(
        item.name,
        await client.get(latencyKey(item.id)),
      )),
    );
    const readyProbeCount = probes.filter((probe) => probe.status === "ready").length;

    return {
      apiUsage: {
        dailyBudget: budget,
        day: dayKey(now),
        detail: "Redis daily counter is readable.",
        generatedAt: now.toISOString(),
        pacingMs: pacingMs(env),
        perMinuteLimit: minuteLimit(env),
        provider: "CoinGlass",
        remainingToday,
        source: "redis",
        status: "ready",
        throttled: remainingToday <= 0,
        usedToday,
      },
      dataSourceLatency: {
        generatedAt: now.toISOString(),
        probes,
        status: readyProbeCount === probes.length ? "ready" : readyProbeCount > 0 ? "partial" : "partial",
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Redis observability error";

    return {
      apiUsage: unavailableApiUsage(env, now, `Redis API 观测读取失败：${detail}`),
      dataSourceLatency: unavailableLatencyReport(env, now, `Redis API 观测读取失败：${detail}`),
    };
  }
}

async function withConfiguredClient<T>(
  env: ApiObservabilityEnv,
  run: (client: ApiObservabilityRedisClient) => Promise<T>,
) {
  if (!env.REDIS_URL?.trim()) {
    return null;
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: env.REDIS_URL }) as unknown as ApiObservabilityRedisClient;

  try {
    return await run(client);
  } finally {
    try {
      await client.quit?.();
    } catch {
      // Observability writes are best-effort and must not break market data fetches.
    }
  }
}

export async function readConfiguredApiObservabilityReport(
  env: ApiObservabilityEnv = process.env,
  now = new Date(),
) {
  const configured = await withConfiguredClient(env, (client) =>
    readApiObservabilityReport({
      client,
      env,
      now,
    })
  );

  return configured ?? readApiObservabilityReport({ env, now });
}

export async function recordConfiguredCoinGlassApiRequest(
  {
    count,
    env = process.env,
    now = new Date(),
  }: {
    count?: number;
    env?: ApiObservabilityEnv;
    now?: Date;
  } = {},
) {
  return withConfiguredClient(env, (client) => recordCoinGlassApiRequest(client, { count, now }));
}

export async function recordConfiguredDataSourceLatency(
  {
    checkedAt = new Date().toISOString(),
    elapsedMs,
    env = process.env,
    source,
  }: {
    checkedAt?: string;
    elapsedMs: number;
    env?: ApiObservabilityEnv;
    source: string;
  },
) {
  return withConfiguredClient(env, (client) =>
    recordDataSourceLatency(client, {
      checkedAt,
      elapsedMs,
      source,
    })
  );
}
