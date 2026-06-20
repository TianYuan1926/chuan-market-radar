import type { MarketDataProvider } from "@/lib/market/types";
import { mockMarketProvider } from "./providers/mock-market-provider";
import { createCoinGlassProvider, type CoinGlassProviderOptions } from "./providers/coinglass-provider";
import { createPublicFuturesUniverseDiscoveryProvider } from "./providers/public-futures-universe-discovery";
import { createCompositePublicLightScanProvider } from "./providers/public-light-scan";

export type ProviderEnv = {
  MARKET_DATA_PROVIDER?: string;
  COINGLASS_API_KEY?: string;
  COINGLASS_BASE_ASSETS?: string;
  COINGLASS_BATCH_SIZE?: string;
  COINGLASS_DAILY_REQUEST_BUDGET?: string;
  COINGLASS_MAX_CONCURRENCY?: string;
  [key: string]: string | undefined;
};

export const defaultCoinGlassBatchSize = 24;
export const defaultCoinGlassDailyRequestBudget = 3_000;
export const defaultCoinGlassMaxConcurrency = 6;

export type GetConfiguredMarketProviderOptions = Pick<
  CoinGlassProviderOptions,
  | "fetcher"
  | "now"
  | "ohlcvProvider"
  | "publicLightScanProvider"
  | "universeDiscoveryProvider"
  | "universePriorityHintNotes"
  | "universePriorityHints"
>;

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

    return createCoinGlassProvider({
      apiKey: env.COINGLASS_API_KEY,
      baseAssets: parseBaseAssets(env.COINGLASS_BASE_ASSETS),
      batchSize,
      coinGlassDailyRequestBudget: dailyRequestBudget,
      fetcher: options.fetcher,
      maxConcurrentRequests,
      now: options.now,
      ohlcvProvider: options.ohlcvProvider,
      publicLightScanProvider: options.publicLightScanProvider ??
        (options.fetcher ? undefined : createCompositePublicLightScanProvider()),
      universeDiscoveryProvider: options.universeDiscoveryProvider ?? createPublicFuturesUniverseDiscoveryProvider(),
      universePriorityHintNotes: options.universePriorityHintNotes,
      universePriorityHints: options.universePriorityHints,
    });
  }

  return mockMarketProvider;
}
