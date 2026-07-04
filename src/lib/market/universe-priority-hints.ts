import type { JournalEvent } from "../analysis/types";
import type { PersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverSnapshot } from "./daily-movers";
import type { ScanArchiveSummary, ScanAssetState } from "./types";
import { normalizeUniverseAsset, type UniversePriorityHint } from "./universe-registry";

export type UniversePriorityHintSourceCounts = {
  archives: number;
  assetStates: number;
  dailyMovers: number;
  journalOutcomes: number;
  trendRadarReviews: number;
};

export type UniversePriorityHintSummary = {
  archivesRead: number;
  assetStatesRead: number;
  dailyMoverSnapshotsRead: number;
  hintsBuilt: number;
  journalEventsRead: number;
  repositoryMode?: PersistenceRepository["mode"];
  repositoryScope?: PersistenceRepository["scope"];
  sourceCounts: UniversePriorityHintSourceCounts;
};

export type UniversePriorityHintReport = {
  hints: UniversePriorityHint[];
  summary: UniversePriorityHintSummary;
};

export type BuildUniversePriorityHintsOptions = {
  archives?: ScanArchiveSummary[];
  assetStates?: ScanAssetState[];
  dailyMoverSnapshots?: DailyMoverSnapshot[];
  journalEvents?: JournalEvent[];
  maxHints?: number;
};

export type BuildUniversePriorityHintsFromRepositoryOptions = {
  archiveLimit?: number;
  assetStateLimit?: number;
  dailyMoverSnapshotLimit?: number;
  journalLimit?: number;
  maxHints?: number;
};

type AssetPriorityAccumulator = {
  anomalyScore: number;
  baseAsset: string;
  consecutiveSkipped: number;
  deepScanCount1h: number;
  deepScanCount24h: number;
  earlyOpportunityScore: number;
  overextensionRiskScore: number;
  recentDeepScanPenalty: number;
  recentSignalCount: number;
  rotationAgeBoost: number;
  rotationPriorityScore: number;
  symbol: string;
  wasDisplacedByDynamicPriority: boolean;
};

const defaultArchiveLimit = 12;
const defaultAssetStateLimit = 1_000;
const defaultDailyMoverSnapshotLimit = 10;
const defaultJournalLimit = 200;
const defaultMaxHints = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedAsset(value: string | undefined) {
  const key = normalizeUniverseAsset(value ?? "");

  return key ? {
    baseAsset: key.baseAsset,
    symbol: key.symbol,
  } : null;
}

function getAccumulator(
  accumulators: Map<string, AssetPriorityAccumulator>,
  rawSymbol: string | undefined,
) {
  const key = normalizedAsset(rawSymbol);

  if (!key) {
    return null;
  }

  const current = accumulators.get(key.symbol);

  if (current) {
    return current;
  }

  const created: AssetPriorityAccumulator = {
    anomalyScore: 0,
    baseAsset: key.baseAsset,
    consecutiveSkipped: 0,
    deepScanCount1h: 0,
    deepScanCount24h: 0,
    earlyOpportunityScore: 0,
    overextensionRiskScore: 0,
    recentDeepScanPenalty: 0,
    recentSignalCount: 0,
    rotationAgeBoost: 0,
    rotationPriorityScore: 0,
    symbol: key.symbol,
    wasDisplacedByDynamicPriority: false,
  };

  accumulators.set(key.symbol, created);

  return created;
}

function addArchiveHints(
  accumulators: Map<string, AssetPriorityAccumulator>,
  archives: ScanArchiveSummary[],
) {
  let count = 0;

  for (const archive of archives) {
    archive.topSymbols.forEach((symbol, index) => {
      const accumulator = getAccumulator(accumulators, symbol);

      if (!accumulator) {
        return;
      }

      const rankWeight = Math.max(4, 18 - index * 4);
      const activityWeight = Math.min(10, archive.candidateCount + archive.anomalyCount);

      accumulator.anomalyScore += rankWeight + activityWeight;
      accumulator.recentSignalCount += 1;
      count += 1;
    });
  }

  return count;
}

function rotationAgeBoost(state: ScanAssetState) {
  const skippedBoost = Math.min(900_000, state.consecutiveSkipped * 90_000);
  const displacementBoost = state.wasDisplacedByDynamicPriority ? 120_000 : 0;

  return Math.max(state.rotationPriorityScore, skippedBoost + displacementBoost);
}

function recentDeepScanPenalty(state: ScanAssetState) {
  if (state.deepScanCount1h <= 0 && state.deepScanCount24h <= 0) {
    return 0;
  }

  return Math.min(1_200_000, state.deepScanCount1h * 450_000 + state.deepScanCount24h * 50_000);
}

function addScanAssetStateHints(
  accumulators: Map<string, AssetPriorityAccumulator>,
  states: ScanAssetState[],
) {
  let count = 0;

  for (const state of states) {
    const accumulator = getAccumulator(accumulators, state.symbol);

    if (!accumulator) {
      continue;
    }

    accumulator.consecutiveSkipped = Math.max(
      accumulator.consecutiveSkipped,
      state.consecutiveSkipped,
    );
    accumulator.deepScanCount1h = Math.max(accumulator.deepScanCount1h, state.deepScanCount1h);
    accumulator.deepScanCount24h = Math.max(accumulator.deepScanCount24h, state.deepScanCount24h);
    accumulator.rotationPriorityScore = Math.max(
      accumulator.rotationPriorityScore,
      state.rotationPriorityScore,
    );
    accumulator.rotationAgeBoost = Math.max(accumulator.rotationAgeBoost, rotationAgeBoost(state));
    accumulator.recentDeepScanPenalty = Math.max(
      accumulator.recentDeepScanPenalty,
      recentDeepScanPenalty(state),
    );
    accumulator.wasDisplacedByDynamicPriority ||= state.wasDisplacedByDynamicPriority;
    count += 1;
  }

  return count;
}

function hintRank(hint: UniversePriorityHint) {
  const earlyOpportunityBoost = (hint.earlyOpportunityScore ?? 0) * 1.5;
  const overextensionPenalty = (hint.overextensionRiskScore ?? 0) * 1.2;

  return (hint.anomalyScore ?? 0) * 4 +
    earlyOpportunityBoost +
    (hint.recentSignalCount ?? 0) * 12 +
    (hint.rotationAgeBoost ?? 0) / 10_000 +
    -overextensionPenalty -
    (hint.recentDeepScanPenalty ?? 0) / 10_000;
}

function toHint(accumulator: AssetPriorityAccumulator): UniversePriorityHint {
  return {
    anomalyScore: Math.round(clamp(accumulator.anomalyScore, 0, 100)),
    baseAsset: accumulator.baseAsset,
    consecutiveSkipped: accumulator.consecutiveSkipped || undefined,
    deepScanCount1h: accumulator.deepScanCount1h || undefined,
    deepScanCount24h: accumulator.deepScanCount24h || undefined,
    earlyOpportunityScore: accumulator.earlyOpportunityScore || undefined,
    overextensionRiskScore: accumulator.overextensionRiskScore || undefined,
    recentDeepScanPenalty: accumulator.recentDeepScanPenalty || undefined,
    recentSignalCount: accumulator.recentSignalCount || undefined,
    rotationAgeBoost: accumulator.rotationAgeBoost || undefined,
    rotationPriorityScore: accumulator.rotationPriorityScore || undefined,
    symbol: accumulator.symbol,
    wasDisplacedByDynamicPriority: accumulator.wasDisplacedByDynamicPriority || undefined,
  };
}

export function buildUniversePriorityHints({
  archives = [],
  assetStates = [],
  dailyMoverSnapshots = [],
  journalEvents = [],
  maxHints = defaultMaxHints,
}: BuildUniversePriorityHintsOptions): UniversePriorityHintReport {
  const accumulators = new Map<string, AssetPriorityAccumulator>();
  const sourceCounts: UniversePriorityHintSourceCounts = {
    archives: addArchiveHints(accumulators, archives),
    assetStates: addScanAssetStateHints(accumulators, assetStates),
    dailyMovers: 0,
    journalOutcomes: 0,
    trendRadarReviews: 0,
  };
  const hints = [...accumulators.values()]
    .map(toHint)
    .filter((hint) =>
      (hint.anomalyScore ?? 0) > 0 ||
      (hint.earlyOpportunityScore ?? 0) > 0 ||
      (hint.rotationAgeBoost ?? 0) > 0 ||
      (hint.recentDeepScanPenalty ?? 0) > 0 ||
      (hint.recentSignalCount ?? 0) > 0
    )
    .sort((left, right) =>
      hintRank(right) - hintRank(left) ||
      (left.symbol ?? "").localeCompare(right.symbol ?? "")
    )
    .slice(0, Math.max(1, Math.floor(maxHints)));

  return {
    hints,
    summary: {
      archivesRead: archives.length,
      assetStatesRead: assetStates.length,
      dailyMoverSnapshotsRead: dailyMoverSnapshots.length,
      hintsBuilt: hints.length,
      journalEventsRead: journalEvents.length,
      sourceCounts,
    },
  };
}

export async function buildUniversePriorityHintsFromRepository(
  repository: PersistenceRepository,
  {
    archiveLimit = defaultArchiveLimit,
    assetStateLimit = defaultAssetStateLimit,
    dailyMoverSnapshotLimit = defaultDailyMoverSnapshotLimit,
    journalLimit = defaultJournalLimit,
    maxHints = defaultMaxHints,
  }: BuildUniversePriorityHintsFromRepositoryOptions = {},
): Promise<UniversePriorityHintReport> {
  const [archives, journalEvents, dailyMoverSnapshots, assetStates] = await Promise.all([
    repository.listScanArchives(archiveLimit),
    repository.listJournalEvents(journalLimit),
    repository.listDailyMoverSnapshots(dailyMoverSnapshotLimit),
    repository.listScanAssetStates(assetStateLimit),
  ]);
  const report = buildUniversePriorityHints({
    archives,
    assetStates,
    dailyMoverSnapshots,
    journalEvents,
    maxHints,
  });

  return {
    ...report,
    summary: {
      ...report.summary,
      repositoryMode: repository.mode,
      repositoryScope: repository.scope,
    },
  };
}
