import type { MarketDataProvider } from "@/lib/market/types";
import { mockMarketProvider } from "./providers/mock-market-provider";
import { createCoinGlassProvider, type CoinGlassProviderOptions } from "./providers/coinglass-provider";
import { createPublicFuturesUniverseDiscoveryProvider } from "./providers/public-futures-universe-discovery";

export type ProviderEnv = {
  MARKET_DATA_PROVIDER?: string;
  COINGLASS_API_KEY?: string;
  COINGLASS_BASE_ASSETS?: string;
  COINGLASS_BATCH_SIZE?: string;
  COINGLASS_DAILY_REQUEST_BUDGET?: string;
  [key: string]: string | undefined;
};

export type GetConfiguredMarketProviderOptions = Pick<
  CoinGlassProviderOptions,
  | "fetcher"
  | "now"
  | "ohlcvProvider"
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

export function getConfiguredMarketProvider(
  env: ProviderEnv = process.env,
  options: GetConfiguredMarketProviderOptions = {},
): MarketDataProvider {
  if (env.MARKET_DATA_PROVIDER === "coinglass" && env.COINGLASS_API_KEY) {
    const batchSize = Number(env.COINGLASS_BATCH_SIZE ?? 3);
    const dailyRequestBudget = Number(env.COINGLASS_DAILY_REQUEST_BUDGET ?? 300);

    return createCoinGlassProvider({
      apiKey: env.COINGLASS_API_KEY,
      baseAssets: parseBaseAssets(env.COINGLASS_BASE_ASSETS),
      batchSize: Number.isFinite(batchSize) ? batchSize : 3,
      coinGlassDailyRequestBudget: Number.isFinite(dailyRequestBudget) && dailyRequestBudget > 0
        ? dailyRequestBudget
        : 300,
      fetcher: options.fetcher,
      now: options.now,
      ohlcvProvider: options.ohlcvProvider,
      universeDiscoveryProvider: options.universeDiscoveryProvider ?? createPublicFuturesUniverseDiscoveryProvider(),
      universePriorityHintNotes: options.universePriorityHintNotes,
      universePriorityHints: options.universePriorityHints,
    });
  }

  return mockMarketProvider;
}
