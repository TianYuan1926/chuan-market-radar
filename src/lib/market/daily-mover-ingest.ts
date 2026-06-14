import type { PersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverSnapshot, RadarSignalSnapshot } from "./daily-movers";
import { requestCoinGlass } from "./providers/coinglass-client";
import { buildCoinGlassDailyMoverSnapshot } from "./providers/coinglass-daily-movers";
import type { CoinGlassMarketRow } from "./providers/coinglass-mapper";

export type CoinGlassDailyMoverIngestOptions = {
  apiKey: string;
  repository: PersistenceRepository;
  baseAssets?: string[];
  limitPerSide?: number;
  maxAssets?: number;
  fetcher?: typeof fetch;
  now?: () => Date;
  radarSignals?: RadarSignalSnapshot[];
};

export type DailyMoverIngestResult = {
  status: "stored";
  storage: PersistenceRepository["mode"];
  scope: string;
  requestedAssets: string[];
  rawRowCount: number;
  snapshot: DailyMoverSnapshot;
  notes: string[];
};

const defaultBaseAssets = ["BTC", "ETH", "SOL"];
const defaultMaxAssets = 8;
const defaultLimitPerSide = 10;

function normalizeBaseAssets(baseAssets?: string[], maxAssets = defaultMaxAssets) {
  const assets = (baseAssets && baseAssets.length > 0 ? baseAssets : defaultBaseAssets)
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
    .map((asset) => asset.replace("/USDT", "").replace("USDT", ""));

  return [...new Set(assets)].slice(0, maxAssets);
}

async function fetchCoinGlassDailyMoverRows({
  apiKey,
  assets,
  fetcher,
}: {
  apiKey: string;
  assets: string[];
  fetcher?: typeof fetch;
}) {
  const rows: CoinGlassMarketRow[] = [];

  for (const symbol of assets) {
    const data = await requestCoinGlass<CoinGlassMarketRow[]>({
      apiKey,
      path: "/api/futures/pairs-markets",
      query: { symbol },
      fetcher,
    });

    rows.push(...data);
  }

  return rows;
}

export async function runCoinGlassDailyMoverIngest({
  apiKey,
  baseAssets,
  fetcher,
  limitPerSide = defaultLimitPerSide,
  maxAssets = defaultMaxAssets,
  now = () => new Date(),
  radarSignals = [],
  repository,
}: CoinGlassDailyMoverIngestOptions): Promise<DailyMoverIngestResult> {
  const requestedAssets = normalizeBaseAssets(baseAssets, maxAssets);
  const observedAt = now().toISOString();
  const rows = await fetchCoinGlassDailyMoverRows({
    apiKey,
    assets: requestedAssets,
    fetcher,
  });
  const snapshot = buildCoinGlassDailyMoverSnapshot({
    observedAt,
    limitPerSide,
    radarSignals,
    rows,
  });
  const storedSnapshot = await repository.addDailyMoverSnapshot(snapshot);

  return {
    status: "stored",
    storage: repository.mode,
    scope: repository.scope,
    requestedAssets,
    rawRowCount: rows.length,
    snapshot: storedSnapshot,
    notes: [
      `coinglass daily mover ingest: requested ${requestedAssets.length} configured assets`,
      `free tier controls: max assets ${maxAssets}, limit per side ${limitPerSide}`,
      `repository storage: ${repository.mode}`,
    ],
  };
}
