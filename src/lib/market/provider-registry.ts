import type { MarketDataProvider } from "@/lib/market/types";
import { mockMarketProvider } from "./providers/mock-market-provider";
import { createCoinGlassProvider } from "./providers/coinglass-provider";
import { createPublicFuturesUniverseDiscoveryProvider } from "./providers/public-futures-universe-discovery";

export type ProviderEnv = {
  MARKET_DATA_PROVIDER?: string;
  COINGLASS_API_KEY?: string;
  COINGLASS_BASE_ASSETS?: string;
  COINGLASS_BATCH_SIZE?: string;
  [key: string]: string | undefined;
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

export function getConfiguredMarketProvider(
  env: ProviderEnv = process.env,
): MarketDataProvider {
  if (env.MARKET_DATA_PROVIDER === "coinglass" && env.COINGLASS_API_KEY) {
    const batchSize = Number(env.COINGLASS_BATCH_SIZE ?? 3);

    return createCoinGlassProvider({
      apiKey: env.COINGLASS_API_KEY,
      baseAssets: parseBaseAssets(env.COINGLASS_BASE_ASSETS),
      batchSize: Number.isFinite(batchSize) ? batchSize : 3,
      universeDiscoveryProvider: createPublicFuturesUniverseDiscoveryProvider(),
    });
  }

  return mockMarketProvider;
}
