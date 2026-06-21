import type { MarketDataProvider } from "@/lib/market/types";
import { createClient } from "redis";
import { mockMarketProvider } from "./providers/mock-market-provider";
import { createCoinGlassProvider, type CoinGlassProviderOptions } from "./providers/coinglass-provider";
import { createPublicFuturesUniverseDiscoveryProvider } from "./providers/public-futures-universe-discovery";
import {
  createCompositePublicLightScanProvider,
  type PublicLightScanProvider,
} from "./providers/public-light-scan";
import { createPublicExchangeOhlcvProvider } from "./ohlcv/public-exchange-provider";
import {
  createRedisWebSocketLightScanStore,
  createWebSocketLightScanProvider,
  type WebSocketLightScanStore,
} from "./ws-light-scan";

export type ProviderEnv = {
  MARKET_DATA_PROVIDER?: string;
  COINGLASS_API_KEY?: string;
  COINGLASS_BASE_ASSETS?: string;
  COINGLASS_BATCH_SIZE?: string;
  COINGLASS_DAILY_REQUEST_BUDGET?: string;
  COINGLASS_MAX_CONCURRENCY?: string;
  COINGLASS_REQUEST_INTERVAL_MS?: string;
  REDIS_URL?: string;
  WS_LIGHT_SCAN_ENABLED?: string;
  WS_LIGHT_SCAN_REDIS_KEY?: string;
  WS_LIGHT_SCAN_STALE_AFTER_MS?: string;
  [key: string]: string | undefined;
};

export const defaultCoinGlassBatchSize = 24;
export const defaultCoinGlassDailyRequestBudget = 3_000;
export const defaultCoinGlassMaxConcurrency = 6;
export const defaultCoinGlassRequestIntervalMs = 500;

let websocketLightScanRedisClientPromise: Promise<{
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { EX?: number }) => Promise<unknown>;
}> | null = null;

export type GetConfiguredMarketProviderOptions = Pick<
  CoinGlassProviderOptions,
  | "altcoinMacro"
  | "fetcher"
  | "now"
  | "ohlcvProvider"
  | "publicLightScanProvider"
  | "universeDiscoveryProvider"
  | "universePriorityHintNotes"
  | "universePriorityHints"
> & {
  webSocketLightScanStore?: WebSocketLightScanStore;
};

export type CreateConfiguredPublicLightScanProviderOptions = {
  restPublicLightScanProvider?: PublicLightScanProvider;
  webSocketLightScanStore?: WebSocketLightScanStore;
};

export function parseBaseAssets(value?: string) {
  if (!value) {
    return undefined;
  }

  const assets = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => item.replace("/USDT", "").replace("USDT", ""));

  return [...new Set(assets)];
}

function positiveNumberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envFlag(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return !["0", "false", "no", "off", "disabled"].includes(value.trim().toLowerCase());
}

function getWebSocketLightScanRedisClient(redisUrl: string) {
  if (!websocketLightScanRedisClientPromise) {
    const client = createClient({ url: redisUrl });

    client.on("error", () => {
      // Redis light scan is a scheduling accelerator. Failures degrade to REST light scan.
    });
    websocketLightScanRedisClientPromise = client.connect().then(() => client);
  }

  return websocketLightScanRedisClientPromise;
}

export function createConfiguredPublicLightScanProvider(
  env: ProviderEnv = process.env,
  options: CreateConfiguredPublicLightScanProviderOptions = {},
): PublicLightScanProvider {
  const restProvider = options.restPublicLightScanProvider ?? createCompositePublicLightScanProvider();

  if (!envFlag(env.WS_LIGHT_SCAN_ENABLED, true)) {
    return restProvider;
  }

  const webSocketStore = options.webSocketLightScanStore ?? (
    env.REDIS_URL
      ? createRedisWebSocketLightScanStore({
          client: {
            async get(key) {
              return (await getWebSocketLightScanRedisClient(env.REDIS_URL as string)).get(key);
            },
            async set(key, value, setOptions) {
              return (await getWebSocketLightScanRedisClient(env.REDIS_URL as string)).set(key, value, setOptions);
            },
          },
          key: env.WS_LIGHT_SCAN_REDIS_KEY,
        })
      : null
  );

  if (!webSocketStore) {
    return restProvider;
  }

  return createCompositePublicLightScanProvider({
    providers: [
      createWebSocketLightScanProvider({
        staleAfterMs: positiveNumberFromEnv(env.WS_LIGHT_SCAN_STALE_AFTER_MS, 3 * 60 * 1000),
        store: webSocketStore,
      }),
      restProvider,
    ],
  });
}

export function getConfiguredMarketProvider(
  env: ProviderEnv = process.env,
  options: GetConfiguredMarketProviderOptions = {},
): MarketDataProvider {
  if (env.MARKET_DATA_PROVIDER === "coinglass" && env.COINGLASS_API_KEY) {
    const batchSize = positiveNumberFromEnv(env.COINGLASS_BATCH_SIZE, defaultCoinGlassBatchSize);
    const dailyRequestBudget = positiveNumberFromEnv(
      env.COINGLASS_DAILY_REQUEST_BUDGET,
      defaultCoinGlassDailyRequestBudget,
    );
    const maxConcurrentRequests = positiveNumberFromEnv(
      env.COINGLASS_MAX_CONCURRENCY,
      defaultCoinGlassMaxConcurrency,
    );
    const requestIntervalMs = nonNegativeNumberFromEnv(
      env.COINGLASS_REQUEST_INTERVAL_MS,
      defaultCoinGlassRequestIntervalMs,
    );

    return createCoinGlassProvider({
      apiKey: env.COINGLASS_API_KEY,
      altcoinMacro: options.altcoinMacro,
      baseAssets: parseBaseAssets(env.COINGLASS_BASE_ASSETS),
      batchSize,
      coinGlassDailyRequestBudget: dailyRequestBudget,
      fetcher: options.fetcher,
      maxConcurrentRequests,
      requestIntervalMs,
      now: options.now,
      ohlcvProvider: options.ohlcvProvider ?? (options.fetcher
        ? undefined
        : createPublicExchangeOhlcvProvider()),
      publicLightScanProvider: options.publicLightScanProvider ??
        (options.fetcher ? undefined : createConfiguredPublicLightScanProvider(env, {
          webSocketLightScanStore: options.webSocketLightScanStore,
        })),
      universeDiscoveryProvider: options.universeDiscoveryProvider ?? createPublicFuturesUniverseDiscoveryProvider(),
      universePriorityHintNotes: options.universePriorityHintNotes,
      universePriorityHints: options.universePriorityHints,
    });
  }

  return mockMarketProvider;
}
