import type { PersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverSnapshot, RadarSignalSnapshot } from "./daily-movers";
import {
  buildDailyMoverCoveragePlan,
  type DailyMoverCoveragePlan,
} from "./daily-mover-coverage-plan";
import type { UniverseDiscoveryProvider } from "./providers/binance-universe-discovery";
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
  universeDiscoveryProvider?: UniverseDiscoveryProvider;
};

export type DailyMoverIngestResult = {
  status: "stored";
  storage: PersistenceRepository["mode"];
  scope: string;
  requestedAssets: string[];
  rawRowCount: number;
  coveragePlan: DailyMoverCoveragePlan;
  snapshot: DailyMoverSnapshot;
  notes: string[];
};

const defaultMaxAssets = 30;
const defaultLimitPerSide = 10;

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
  universeDiscoveryProvider,
}: CoinGlassDailyMoverIngestOptions): Promise<DailyMoverIngestResult> {
  const observedAtDate = now();
  const observedAt = observedAtDate.toISOString();
  const coveragePlan = await buildDailyMoverCoveragePlan({
    baseAssets,
    maxAssets,
    now: observedAtDate,
    universeDiscoveryProvider,
  });
  const requestedAssets = coveragePlan.requestedAssets;
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
    coveragePlan,
    snapshot: storedSnapshot,
    notes: [
      `coinglass daily mover ingest: requested ${requestedAssets.length} ${coveragePlan.mode} assets`,
      `free tier controls: max assets ${maxAssets}, limit per side ${limitPerSide}`,
      `daily mover coverage: universe ${coveragePlan.totalUniverseAssets}, discovery ${coveragePlan.discovery.status} ${coveragePlan.discovery.source}`,
      ...coveragePlan.notes,
      `repository storage: ${repository.mode}`,
    ],
  };
}
