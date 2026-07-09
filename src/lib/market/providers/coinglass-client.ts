import {
  recordConfiguredCoinGlassApiRequest,
  recordConfiguredDataSourceLatency,
} from "../../runtime/api-observability";

export const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com";

export type CoinGlassQuery = Record<string, string | number | boolean | undefined>;

export type CoinGlassRequestOptions = {
  apiKey: string;
  path: string;
  query?: CoinGlassQuery;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

type CoinGlassPaceOptions = {
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type CoinGlassRateLimit = {
  max?: number;
  used?: number;
};

export type CoinGlassEndpointBudgetSnapshot = {
  cooldownUntil?: string;
  circuitOpenUntil?: string;
  endpoint: string;
  maxRequests: number;
  remainingRequests: number;
  usedRequests: number;
};

export type CoinGlassRateLimitStateSnapshot = {
  budgetWindow: "1m";
  cooldownUntil?: string;
  deferredRequests: number;
  endpointBudgets: CoinGlassEndpointBudgetSnapshot[];
  maxRequests: number;
  provider: "coinglass";
  rateLimitedEndpoints: string[];
  remainingRequests: number;
  usedRequests: number;
};

export type CoinGlassEnvelope<T> = {
  code: string | number;
  msg?: string;
  data: T;
};

export class CoinGlassApiError extends Error {
  code: string;
  controlled?: boolean;
  cooldownUntil?: string;
  endpoint?: string;
  httpStatus: number;
  rateLimit?: CoinGlassRateLimit;
  retryAfterMs?: number;

  constructor({
    code,
    controlled,
    cooldownUntil,
    endpoint,
    httpStatus,
    message,
    rateLimit,
    retryAfterMs,
  }: {
    code: string;
    controlled?: boolean;
    cooldownUntil?: string;
    endpoint?: string;
    httpStatus: number;
    message: string;
    rateLimit?: CoinGlassRateLimit;
    retryAfterMs?: number;
  }) {
    super(message);
    this.name = "CoinGlassApiError";
    this.code = code;
    this.controlled = controlled;
    this.cooldownUntil = cooldownUntil;
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
    this.rateLimit = rateLimit;
    this.retryAfterMs = retryAfterMs;
  }
}

let coinGlassGlobalPaceChain: Promise<void> = Promise.resolve();
let nextCoinGlassRequestAt = 0;
let coinGlassBudgetWindowStartedAt = 0;
let coinGlassProviderUsedRequests = 0;
let coinGlassProviderDeferredRequests = 0;

type CoinGlassEndpointBudgetState = {
  circuitOpenUntil: number;
  consecutiveRateLimits: number;
  cooldownUntil: number;
  deferredRequests: number;
  usedRequests: number;
  windowStartedAt: number;
};

const coinGlassEndpointBudgets = new Map<string, CoinGlassEndpointBudgetState>();

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function configuredGlobalPacingMs() {
  const parsed = Number(process.env.COINGLASS_REQUEST_INTERVAL_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.min(60_000, Math.floor(parsed));
}

function configuredMinuteRequestLimit() {
  const parsed = Number(process.env.COINGLASS_MINUTE_REQUEST_LIMIT);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.min(1_000, Math.floor(parsed));
}

function configuredEndpointMinuteRequestLimit() {
  const parsed = Number(process.env.COINGLASS_ENDPOINT_MINUTE_REQUEST_LIMIT);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return configuredMinuteRequestLimit();
  }

  return Math.min(configuredMinuteRequestLimit(), Math.floor(parsed));
}

function configuredRateLimitCooldownMs() {
  const parsed = Number(process.env.COINGLASS_RATE_LIMIT_COOLDOWN_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60_000;
  }

  return Math.min(15 * 60_000, Math.floor(parsed));
}

function configuredCircuitBreaker429Threshold() {
  const parsed = Number(process.env.COINGLASS_CIRCUIT_BREAKER_429_THRESHOLD);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3;
  }

  return Math.min(20, Math.floor(parsed));
}

function configuredCircuitBreakerMs() {
  const parsed = Number(process.env.COINGLASS_CIRCUIT_BREAKER_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5 * 60_000;
  }

  return Math.min(60 * 60_000, Math.floor(parsed));
}

function endpointKeyFromPath(path: string) {
  return path.split("?")[0] || path;
}

function getEndpointBudgetState(endpoint: string, now = Date.now()) {
  let state = coinGlassEndpointBudgets.get(endpoint);

  if (!state) {
    state = {
      circuitOpenUntil: 0,
      consecutiveRateLimits: 0,
      cooldownUntil: 0,
      deferredRequests: 0,
      usedRequests: 0,
      windowStartedAt: now,
    };
    coinGlassEndpointBudgets.set(endpoint, state);
  }

  if (now - state.windowStartedAt >= 60_000) {
    state.usedRequests = 0;
    state.windowStartedAt = now;
  }

  return state;
}

function resetProviderBudgetWindowIfNeeded(now = Date.now()) {
  if (coinGlassBudgetWindowStartedAt === 0 || now - coinGlassBudgetWindowStartedAt >= 60_000) {
    coinGlassBudgetWindowStartedAt = now;
    coinGlassProviderUsedRequests = 0;
  }
}

function isoFromTime(value: number) {
  return value > 0 ? new Date(value).toISOString() : undefined;
}

function throwControlledRateLimit({
  endpoint,
  message,
  now = Date.now(),
  state,
}: {
  endpoint: string;
  message: string;
  now?: number;
  state: CoinGlassEndpointBudgetState;
}): never {
  state.deferredRequests += 1;
  coinGlassProviderDeferredRequests += 1;
  const cooldownUntil = Math.max(state.cooldownUntil, state.circuitOpenUntil);

  throw new CoinGlassApiError({
    code: "429",
    controlled: true,
    cooldownUntil: isoFromTime(cooldownUntil),
    endpoint,
    httpStatus: 429,
    message,
    retryAfterMs: Math.max(0, cooldownUntil - now),
  });
}

function reserveCoinGlassBudget(path: string, now = Date.now()) {
  const endpoint = endpointKeyFromPath(path);
  const providerLimit = configuredMinuteRequestLimit();
  const endpointLimit = configuredEndpointMinuteRequestLimit();
  const state = getEndpointBudgetState(endpoint, now);

  resetProviderBudgetWindowIfNeeded(now);

  if (state.circuitOpenUntil > now) {
    throwControlledRateLimit({
      endpoint,
      message: `CoinGlass endpoint ${endpoint} circuit breaker is open after repeated 429 responses`,
      now,
      state,
    });
  }

  if (state.cooldownUntil > now) {
    throwControlledRateLimit({
      endpoint,
      message: `CoinGlass endpoint ${endpoint} is cooling down after rate limit`,
      now,
      state,
    });
  }

  if (coinGlassProviderUsedRequests >= providerLimit) {
    state.cooldownUntil = Math.max(state.cooldownUntil, now + configuredRateLimitCooldownMs());
    throwControlledRateLimit({
      endpoint,
      message: `CoinGlass provider minute budget exhausted before requesting ${endpoint}`,
      now,
      state,
    });
  }

  if (state.usedRequests >= endpointLimit) {
    state.cooldownUntil = Math.max(state.cooldownUntil, now + configuredRateLimitCooldownMs());
    throwControlledRateLimit({
      endpoint,
      message: `CoinGlass endpoint minute budget exhausted for ${endpoint}`,
      now,
      state,
    });
  }

  coinGlassProviderUsedRequests += 1;
  state.usedRequests += 1;

  return endpoint;
}

async function reserveCoinGlassGlobalRequestSlot({
  intervalMs = configuredGlobalPacingMs(),
  now = Date.now,
  sleep = defaultSleep,
}: CoinGlassPaceOptions = {}) {
  if (intervalMs <= 0) {
    return undefined;
  }

  const previous = coinGlassGlobalPaceChain;
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  coinGlassGlobalPaceChain = previous.then(() => current);

  await previous;

  try {
    const waitMs = Math.max(0, nextCoinGlassRequestAt - now());

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const reservedAt = Math.max(nextCoinGlassRequestAt, now());
    nextCoinGlassRequestAt = reservedAt + intervalMs;
    return reservedAt;
  } finally {
    release();
  }
}

export async function reserveCoinGlassGlobalRequestSlotForTest(
  options: CoinGlassPaceOptions = {},
) {
  return reserveCoinGlassGlobalRequestSlot(options);
}

export function resetCoinGlassGlobalPaceForTest() {
  coinGlassGlobalPaceChain = Promise.resolve();
  nextCoinGlassRequestAt = 0;
}

function toNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function rateLimitFromHeaders(headers: Headers): CoinGlassRateLimit {
  return {
    max: toNumber(headers.get("API-KEY-MAX-LIMIT")),
    used: toNumber(headers.get("API-KEY-USE-LIMIT")),
  };
}

function retryAfterMsFromHeaders(headers: Headers) {
  const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds * 1_000));
  }

  const date = Date.parse(retryAfter);

  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

function recordCoinGlassRateLimit(endpoint: string, retryAfterMs: number | undefined, now = Date.now()) {
  const state = getEndpointBudgetState(endpoint, now);
  const cooldownMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : configuredRateLimitCooldownMs();

  state.consecutiveRateLimits += 1;
  state.cooldownUntil = Math.max(state.cooldownUntil, now + cooldownMs);

  if (state.consecutiveRateLimits >= configuredCircuitBreaker429Threshold()) {
    state.circuitOpenUntil = Math.max(state.circuitOpenUntil, now + configuredCircuitBreakerMs());
  }

  return state;
}

function recordCoinGlassSuccess(endpoint: string, now = Date.now()) {
  const state = getEndpointBudgetState(endpoint, now);

  state.consecutiveRateLimits = 0;
}

export function getCoinGlassRateLimitStateSnapshot(now = Date.now()): CoinGlassRateLimitStateSnapshot {
  resetProviderBudgetWindowIfNeeded(now);
  const providerLimit = configuredMinuteRequestLimit();
  const endpointLimit = configuredEndpointMinuteRequestLimit();
  const endpointBudgets = [...coinGlassEndpointBudgets.entries()]
    .map(([endpoint, state]) => {
      getEndpointBudgetState(endpoint, now);
      return {
        cooldownUntil: isoFromTime(state.cooldownUntil),
        circuitOpenUntil: isoFromTime(state.circuitOpenUntil),
        endpoint,
        maxRequests: endpointLimit,
        remainingRequests: Math.max(0, endpointLimit - state.usedRequests),
        usedRequests: state.usedRequests,
      };
    })
    .sort((left, right) => left.endpoint.localeCompare(right.endpoint));
  const cooldowns = endpointBudgets
    .flatMap((item) => [item.cooldownUntil, item.circuitOpenUntil])
    .filter((item): item is string => Boolean(item))
    .map((item) => Date.parse(item))
    .filter((item) => Number.isFinite(item) && item > now);

  return {
    budgetWindow: "1m",
    cooldownUntil: cooldowns.length > 0 ? new Date(Math.max(...cooldowns)).toISOString() : undefined,
    deferredRequests: coinGlassProviderDeferredRequests,
    endpointBudgets,
    maxRequests: providerLimit,
    provider: "coinglass",
    rateLimitedEndpoints: endpointBudgets
      .filter((item) =>
        (item.cooldownUntil && Date.parse(item.cooldownUntil) > now) ||
        (item.circuitOpenUntil && Date.parse(item.circuitOpenUntil) > now)
      )
      .map((item) => item.endpoint),
    remainingRequests: Math.max(0, providerLimit - coinGlassProviderUsedRequests),
    usedRequests: coinGlassProviderUsedRequests,
  };
}

export function resetCoinGlassRateLimitStateForTest() {
  coinGlassBudgetWindowStartedAt = 0;
  coinGlassProviderDeferredRequests = 0;
  coinGlassProviderUsedRequests = 0;
  coinGlassEndpointBudgets.clear();
}

export function buildCoinGlassUrl(
  path: string,
  query: CoinGlassQuery = {},
  baseUrl = COINGLASS_BASE_URL,
) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

export async function requestCoinGlass<T>({
  apiKey,
  baseUrl,
  fetcher = fetch,
  path,
  query,
}: CoinGlassRequestOptions): Promise<T> {
  const url = buildCoinGlassUrl(path, query, baseUrl);
  const endpoint = reserveCoinGlassBudget(path);
  const headers = new Headers({
    accept: "application/json",
    "CG-API-KEY": apiKey,
  });

  await reserveCoinGlassGlobalRequestSlot();

  const startedAt = Date.now();

  try {
    const response = await fetcher(url, {
      method: "GET",
      headers,
    });
    const payload = await response.json() as CoinGlassEnvelope<T>;
    const code = String(payload.code);

    if (!response.ok || code !== "0") {
      const retryAfterMs = response.status === 429 || code === "429"
        ? retryAfterMsFromHeaders(response.headers)
        : undefined;
      const rateLimitedState = response.status === 429 || code === "429"
        ? recordCoinGlassRateLimit(endpoint, retryAfterMs)
        : undefined;

      throw new CoinGlassApiError({
        code,
        controlled: response.status === 429 || code === "429",
        cooldownUntil: isoFromTime(Math.max(rateLimitedState?.cooldownUntil ?? 0, rateLimitedState?.circuitOpenUntil ?? 0)),
        endpoint,
        httpStatus: response.status,
        message: payload.msg ?? `CoinGlass request failed with code ${code}`,
        rateLimit: rateLimitFromHeaders(response.headers),
        retryAfterMs,
      });
    }

    recordCoinGlassSuccess(endpoint);
    return payload.data;
  } finally {
    const elapsedMs = Date.now() - startedAt;

    void Promise.allSettled([
      recordConfiguredCoinGlassApiRequest(),
      recordConfiguredDataSourceLatency({
        elapsedMs,
        source: "coinglass",
      }),
    ]);
  }
}
