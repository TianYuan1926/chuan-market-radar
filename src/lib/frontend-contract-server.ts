import { buildBackendContract } from "@/lib/api/backend-contract";
import {
  buildFrontendKlineContract,
  buildFrontendLeaderboardContract,
  buildFrontendRadarContract,
  buildFrontendReviewContract,
  buildFrontendTokenDossierContract,
  type KlineChartCandle,
} from "@/lib/api/frontend-contract";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { buildSignalBackendDossier } from "@/lib/market/signal-backend-dossier";
import type { OhlcvInterval } from "@/lib/market/ohlcv/types";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";
import type {
  LeaderboardKind,
  LeaderboardRow,
  RadarContract,
  ReviewContract,
  TokenDossier,
} from "@/lib/radar-contract";
import type { Resource } from "@/lib/data-status";

const leaderboardKinds: LeaderboardKind[] = [
  "gainers",
  "losers",
  "volume",
  "volatility_squeeze",
  "relative_strength",
  "oi_change",
  "funding_hot",
];

async function readPageBackend() {
  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "page_ssr",
  });
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });

  return {
    backend: buildBackendContract({ health, snapshot }),
    snapshot,
  };
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
  const { backend, snapshot } = await readPageBackend();

  return buildFrontendLeaderboardContract({
    backend,
    kind,
    snapshot,
  }) as unknown as Resource<LeaderboardRow[]>;
}

export async function getAllLeaderboardContractsForPage(): Promise<
  Partial<Record<LeaderboardKind, Resource<LeaderboardRow[]>>>
> {
  const { backend, snapshot } = await readPageBackend();

  return Object.fromEntries(
    leaderboardKinds.map((kind) => [
      kind,
      buildFrontendLeaderboardContract({ backend, kind, snapshot }),
    ]),
  ) as Partial<Record<LeaderboardKind, Resource<LeaderboardRow[]>>>;
}

export async function getTokenDossierContractForPage(
  symbol: string,
  basePrice = 1,
): Promise<Resource<TokenDossier>> {
  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "page_ssr",
  });
  const dossier = buildSignalBackendDossier({ snapshot, symbol });

  return buildFrontendTokenDossierContract({
    basePrice,
    dossier,
  }) as unknown as Resource<TokenDossier>;
}

export async function getKlineContractForPage(
  symbol: string,
  interval: OhlcvInterval = "4h",
): Promise<Resource<KlineChartCandle[]>> {
  return buildFrontendKlineContract({
    interval,
    repository: appPersistenceRepository,
    symbol,
  }) as unknown as Resource<KlineChartCandle[]>;
}

export async function getReviewContractForPage(): Promise<ReviewContract> {
  const { backend, snapshot } = await readPageBackend();

  return buildFrontendReviewContract({
    backend,
    snapshot,
  }) as unknown as ReviewContract;
}
