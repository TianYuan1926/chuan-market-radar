import { fetchBinanceTickers } from "../modules/market-fact/adapters/binance-ticker";
import { fetchBybitTickers } from "../modules/market-fact/adapters/bybit-ticker";
import { fetchOkxTickers } from "../modules/market-fact/adapters/okx-ticker";
import { buildLastPriceFacts } from "../modules/market-fact/build-last-price-facts";
import { buildCrossVenueFeatureSet } from "../modules/feature/build-feature-set";
import { buildFeatureQualitySnapshot } from "../modules/feature/build-feature-quality";
import { buildM1MarketContext } from "../modules/market-context/build-market-context";
import { fetchBinanceCatalog } from "../modules/universe/adapters/binance-catalog";
import { fetchBybitCatalog } from "../modules/universe/adapters/bybit-catalog";
import { fetchOkxCatalog } from "../modules/universe/adapters/okx-catalog";
import { buildEligibleInstrumentSnapshot } from "../modules/universe/build-eligible-snapshot";
import type { PublicJsonTransport } from "../modules/universe/public-json-transport";
import {
  BINANCE_CATALOG,
  BINANCE_TICKERS,
  BYBIT_CATALOG,
  BYBIT_TICKERS,
  CATALOG_RECEIVED_AT,
  GENERATED_AT,
  NORMALIZED_AT,
  OKX_CATALOG,
  OKX_TICKERS,
  SOURCE_CUTOFF,
  TICKER_RECEIVED_AT,
} from "./m1-provider-fixtures";

function transport(data: unknown, receivedAt: string): PublicJsonTransport {
  return async () => ({ data, ok: true, receivedAt, status: 200 });
}

export async function buildFrozenM1IdentityFactSlice() {
  const catalogs = await Promise.all([
    fetchBinanceCatalog(transport(BINANCE_CATALOG, CATALOG_RECEIVED_AT)),
    fetchOkxCatalog(transport(OKX_CATALOG, CATALOG_RECEIVED_AT)),
    fetchBybitCatalog(transport(BYBIT_CATALOG, CATALOG_RECEIVED_AT)),
  ]);
  const universe = buildEligibleInstrumentSnapshot({
    catalogs,
    generatedAt: GENERATED_AT,
    policyVersion: "m1-linear-usdt-perpetual.v1",
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
  });
  const batches = await Promise.all([
    fetchBinanceTickers(transport(BINANCE_TICKERS, TICKER_RECEIVED_AT)),
    fetchOkxTickers(transport(OKX_TICKERS, TICKER_RECEIVED_AT)),
    fetchBybitTickers(transport(BYBIT_TICKERS, TICKER_RECEIVED_AT)),
  ]);
  const marketFacts = buildLastPriceFacts({
    batches,
    generatedAt: GENERATED_AT,
    normalizedAt: NORMALIZED_AT,
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe,
  });
  return { marketFacts, universe };
}

export async function buildFrozenM1FeatureContextSlice() {
  const foundation = await buildFrozenM1IdentityFactSlice();
  const common = {
    computedAt: "2026-01-15T00:00:00.400Z",
    factQuality: foundation.marketFacts.qualitySnapshot,
    facts: foundation.marketFacts.facts,
    generatedAt: "2026-01-15T00:00:00.500Z",
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe: foundation.universe,
  } as const;
  const onlineFeatureSet = buildCrossVenueFeatureSet({
    ...common,
    computationMode: "ONLINE",
    computationRunId: "m1-fixture-online-run",
  });
  const replayFeatureSet = buildCrossVenueFeatureSet({
    ...common,
    computationMode: "REPLAY",
    computationRunId: "m1-fixture-replay-run-1",
  });
  const replayRepeatFeatureSet = buildCrossVenueFeatureSet({
    ...common,
    computationMode: "REPLAY",
    computationRunId: "m1-fixture-replay-run-2",
  });
  const featureQuality = buildFeatureQualitySnapshot({
    generatedAt: "2026-01-15T00:00:00.600Z",
    onlineFeatureSet,
    releaseId: "m1-test-release",
    replayFeatureSet,
    replayRepeatFeatureSet,
    sourceCutoff: SOURCE_CUTOFF,
  });
  const marketContext = buildM1MarketContext({
    featureQuality,
    featureSet: onlineFeatureSet,
    generatedAt: "2026-01-15T00:00:00.700Z",
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe: foundation.universe,
  });
  return {
    ...foundation,
    onlineFeatureSet,
    replayFeatureSet,
    replayRepeatFeatureSet,
    featureQuality,
    marketContext,
  };
}
