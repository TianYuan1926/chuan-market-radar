import { buildBackendContract } from "@/lib/api/backend-contract";
import { getDailyMoverReadArchive } from "@/lib/api/daily-mover-readonly";
import {
  buildFrontendKlineContract,
  buildFrontendLeaderboardContract,
  buildFrontendRadarContract,
  buildFrontendReviewContract,
  buildFrontendTokenDossierContract,
  type KlineContractResource,
} from "@/lib/api/frontend-contract";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getLatestHistoricalBacktestResource } from "@/lib/api/historical-backtest-readonly";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { createCompositePublicLightScanProvider } from "@/lib/market/providers/public-light-scan";
import { buildSignalBackendDossier } from "@/lib/market/signal-backend-dossier";
import type { OhlcvInterval } from "@/lib/market/ohlcv/types";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";
import { readConfiguredRuntimeProbeReport } from "@/lib/runtime/worker-heartbeat";
import type {
  LeaderboardKind,
  LeaderboardRow,
  RadarContract,
  ReviewContract,
  TokenDossier,
} from "@/lib/radar-contract";
import type { Resource } from "@/lib/data-status";
import type { PublicLightScanResult } from "@/lib/market/providers/public-light-scan";

export {
  dataStatusToHealthLevel,
} from "@/lib/contracts/frontend-health-level";

const leaderboardKinds: LeaderboardKind[] = [
  "gainers",
  "losers",
  "volume",
  "volatility_squeeze",
  "relative_strength",
  "oi_change",
  "funding_hot",
];

type TimedMemoryCache<T> = {
  expiresAt: number;
  hasValue: boolean;
  inFlight?: Promise<T>;
  value?: T;
};

function ttlMsFromEnv(name: string, fallbackMs: number) {
  const parsed = Number(process.env[name]);

  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  return Math.max(0, Math.min(60_000, Math.floor(parsed)));
}

async function readThroughTtlCache<T>(
  cache: TimedMemoryCache<T>,
  ttlMs: number,
  load: () => Promise<T>,
) {
  const now = Date.now();

  if (ttlMs > 0 && cache.hasValue && cache.expiresAt > now) {
    return cache.value as T;
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = load()
    .then((value) => {
      cache.value = value;
      cache.hasValue = true;
      cache.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
      return value;
    })
    .finally(() => {
      cache.inFlight = undefined;
    });

  return cache.inFlight;
}

type PageBackendPayload = Awaited<ReturnType<typeof readPageBackendUncached>>;
type PublicMarketBoardPayload = Awaited<ReturnType<typeof readPublicMarketBoardUncached>>;

const pageBackendCache: TimedMemoryCache<PageBackendPayload> = {
  expiresAt: 0,
  hasValue: false,
};

const publicMarketBoardCache: TimedMemoryCache<PublicMarketBoardPayload> = {
  expiresAt: 0,
  hasValue: false,
};

async function readPageBackendUncached() {
  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "page_ssr",
  });
  const runtimeProbes = await readConfiguredRuntimeProbeReport(process.env);
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    runtimeProbes,
    snapshot,
  });

  return {
    backend: buildBackendContract({ health, snapshot }),
    snapshot,
  };
}

export async function readPageBackend() {
  return readThroughTtlCache(
    pageBackendCache,
    ttlMsFromEnv("FRONTEND_BACKEND_CONTRACT_CACHE_TTL_MS", 5_000),
    readPageBackendUncached,
  );
}

async function readPublicMarketBoardUncached(): Promise<Pick<PublicLightScanResult, "diagnostics" | "tickers"> | undefined> {
  const provider = createCompositePublicLightScanProvider({
    maxPriorityCandidates: Number(process.env.FRONTEND_PUBLIC_MARKET_MAX_CANDIDATES ?? 120),
  });
  const result = await provider.scan();

  if (result.tickers.length === 0) {
    return undefined;
  }

  return {
    diagnostics: result.diagnostics,
    tickers: result.tickers,
  };
}

async function readPublicMarketBoard() {
  return readThroughTtlCache(
    publicMarketBoardCache,
    ttlMsFromEnv("FRONTEND_PUBLIC_MARKET_CACHE_TTL_MS", 15_000),
    readPublicMarketBoardUncached,
  );
}

async function readCurrentJournalEventsForReview() {
  try {
    return await appPersistenceRepository.listJournalEvents(120);
  } catch {
    return [];
  }
}

export async function getRadarContractForPage(): Promise<RadarContract> {
  const { backend, snapshot } = await readPageBackend();

  return buildFrontendRadarContract({
    backend,
    snapshot,
    env: {
      COINGLASS_DAILY_REQUEST_BUDGET: process.env.COINGLASS_DAILY_REQUEST_BUDGET,
      COINGLASS_REQUEST_INTERVAL_MS: process.env.COINGLASS_REQUEST_INTERVAL_MS,
    },
  }) as unknown as RadarContract;
}

export async function getLeaderboardContractForPage(
  kind: LeaderboardKind,
): Promise<Resource<LeaderboardRow[]>> {
  const [{ backend, snapshot }, publicMarket] = await Promise.all([
    readPageBackend(),
    readPublicMarketBoard(),
  ]);

  return buildFrontendLeaderboardContract({
    backend,
    kind,
    publicMarket,
    snapshot,
  }) as unknown as Resource<LeaderboardRow[]>;
}

export async function getAllLeaderboardContractsForPage(): Promise<
  Partial<Record<LeaderboardKind, Resource<LeaderboardRow[]>>>
> {
  const [{ backend, snapshot }, publicMarket] = await Promise.all([
    readPageBackend(),
    readPublicMarketBoard(),
  ]);

  return Object.fromEntries(
    leaderboardKinds.map((kind) => [
      kind,
      buildFrontendLeaderboardContract({ backend, kind, publicMarket, snapshot }),
    ]),
  ) as Partial<Record<LeaderboardKind, Resource<LeaderboardRow[]>>>;
}

export async function getTokenDossierContractForPage(
  symbol: string,
  basePrice = 1,
): Promise<Resource<TokenDossier>> {
  const { backend, snapshot } = await readPageBackend();
  const dossier = buildSignalBackendDossier({
    lightScanCandidates: backend.scanProof.lightScan.topCandidates,
    snapshot,
    symbol,
  });

  return buildFrontendTokenDossierContract({
    basePrice,
    dossier,
  }) as unknown as Resource<TokenDossier>;
}

export async function getKlineContractForPage(
  symbol: string,
  interval: OhlcvInterval = "4h",
): Promise<KlineContractResource> {
  const { backend, snapshot } = await readPageBackend();
  const dossier = buildSignalBackendDossier({
    lightScanCandidates: backend.scanProof.lightScan.topCandidates,
    snapshot,
    symbol,
  });

  return buildFrontendKlineContract({
    dossier,
    interval,
    repository: appPersistenceRepository,
    symbol,
  });
}

export async function getReviewContractForPage(): Promise<ReviewContract> {
  const [{ backend, snapshot }, dailyMoverArchive, historicalBacktest, journalEvents] = await Promise.all([
    readPageBackend(),
    getDailyMoverReadArchive({
      limit: 7,
      repository: appPersistenceRepository,
    }),
    getLatestHistoricalBacktestResource(),
    readCurrentJournalEventsForReview(),
  ]);
  const reviewSnapshot = {
    ...snapshot,
    journalEvents,
  };

  return buildFrontendReviewContract({
    backend,
    dailyMoverArchive: dailyMoverArchive.body.ok ? dailyMoverArchive.body : null,
    historicalBacktest,
    snapshot: reviewSnapshot,
  }) as unknown as ReviewContract;
}
