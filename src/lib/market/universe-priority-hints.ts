import type { JournalEvent, SignalOutcomeStatus } from "../analysis/types";
import type { PersistenceRepository } from "../persistence/persistence-store";
import type { DailyMover, DailyMoverReview, DailyMoverSnapshot } from "./daily-movers";
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
  cooldownReviews: number;
  consecutiveSkipped: number;
  deepScanCount1h: number;
  deepScanCount24h: number;
  earlyOpportunityScore: number;
  historicalPositive: number;
  historicalSamples: number;
  missedOpportunities: number;
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
    cooldownReviews: 0,
    consecutiveSkipped: 0,
    deepScanCount1h: 0,
    deepScanCount24h: 0,
    earlyOpportunityScore: 0,
    historicalPositive: 0,
    historicalSamples: 0,
    missedOpportunities: 0,
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

function outcomeValue(event: JournalEvent): boolean | null {
  const outcome = event.outcomeStatus;

  if (outcome === "partial_win" || outcome === "saved") {
    return true;
  }

  if (outcome === "loss" || outcome === "expired") {
    return false;
  }

  if (!outcome || outcome === "pending") {
    if (event.result === "win" || event.result === "saved") {
      return true;
    }

    if (event.result === "loss") {
      return false;
    }
  }

  return null;
}

function addHistoricalOutcome(
  accumulator: AssetPriorityAccumulator,
  outcome: SignalOutcomeStatus | JournalEvent["result"] | boolean,
) {
  const positive = typeof outcome === "boolean"
    ? outcome
    : outcome === "partial_win" || outcome === "saved" || outcome === "win";

  accumulator.historicalSamples += 1;

  if (positive) {
    accumulator.historicalPositive += 1;
  } else {
    accumulator.cooldownReviews += 1;
  }
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

function addTrendRadarReviewHint(
  accumulator: AssetPriorityAccumulator,
  event: JournalEvent,
) {
  const review = event.trendRadarReview;

  if (!review) {
    return false;
  }

  if (review.verdict === "missed") {
    accumulator.missedOpportunities += 1;
    accumulator.anomalyScore += 36;
    accumulator.recentSignalCount += 1;

    return true;
  }

  if (review.verdict === "reaction_confirmed" || review.verdict === "saved") {
    accumulator.anomalyScore += 10;
    accumulator.recentSignalCount += 1;
    addHistoricalOutcome(accumulator, true);

    return true;
  }

  if (review.verdict === "invalidated" || review.verdict === "false_positive") {
    addHistoricalOutcome(accumulator, false);

    return true;
  }

  if (review.verdict === "needs_more_evidence" || review.verdict === "pending") {
    accumulator.recentSignalCount += 1;

    return true;
  }

  return false;
}

function addJournalHints(
  accumulators: Map<string, AssetPriorityAccumulator>,
  journalEvents: JournalEvent[],
) {
  let journalOutcomes = 0;
  let trendRadarReviews = 0;

  for (const event of journalEvents) {
    const accumulator = getAccumulator(accumulators, event.symbol);

    if (!accumulator) {
      continue;
    }

    if (addTrendRadarReviewHint(accumulator, event)) {
      trendRadarReviews += 1;
      continue;
    }

    accumulator.recentSignalCount += 1;
    const outcome = outcomeValue(event);

    if (outcome !== null) {
      addHistoricalOutcome(accumulator, outcome);
      journalOutcomes += 1;
    }
  }

  return { journalOutcomes, trendRadarReviews };
}

function evidenceStrengthBoost(review?: DailyMoverReview) {
  if (review?.attribution.evidenceStrength === "strong") {
    return 24;
  }

  if (review?.attribution.evidenceStrength === "medium") {
    return 12;
  }

  return 4;
}

function radarReviewBoost(review?: DailyMoverReview) {
  if (review?.radarReview.status === "missed") {
    return 18;
  }

  if (review?.radarReview.status === "caught") {
    return 10;
  }

  return 0;
}

function dailyMoverAnomalyScore(mover: DailyMover, review?: DailyMoverReview) {
  const moveMagnitude = Math.min(60, Math.abs(mover.priceChangePercent) * 1.25);
  const rankBoost = Math.max(0, 12 - mover.rank * 2);
  const oiBoost = Math.min(12, Math.abs(mover.openInterestChangePercent ?? 0) / 2);
  const volumeBoost = mover.volume24hUsd >= 20_000_000 ? 10 : 0;
  const preMoveBoost = review?.preMovePattern?.earlyWarningScore
    ? Math.min(24, review.preMovePattern.earlyWarningScore * 0.3)
    : 0;

  return moveMagnitude + rankBoost + oiBoost + volumeBoost +
    preMoveBoost + evidenceStrengthBoost(review) + radarReviewBoost(review);
}

function dailyMoverEarlyOpportunityScore(mover: DailyMover, review?: DailyMoverReview) {
  const score = review?.preMovePattern?.earlyWarningScore ?? 0;
  const matchedBeforeMove = (review?.radarReview.matchedSignalIds.length ?? 0) > 0;
  const learnableMiss = review?.radarReview.status === "missed" && score >= 50;
  const modestPreMove = Math.abs(mover.priceChangePercent) <= 25 && score >= 40;

  if (matchedBeforeMove || learnableMiss || modestPreMove) {
    return Math.round(Math.min(100, Math.max(0, score)));
  }

  return 0;
}

function dailyMoverOverextensionRiskScore(mover: DailyMover, review?: DailyMoverReview) {
  const score = review?.preMovePattern?.earlyWarningScore ?? 0;
  const magnitude = Math.abs(mover.priceChangePercent);

  if (magnitude >= 30 && score < 50) {
    return Math.round(Math.min(100, magnitude));
  }

  if (magnitude >= 45) {
    return Math.round(Math.min(100, magnitude * 0.8));
  }

  return 0;
}

function addDailyMoverHints(
  accumulators: Map<string, AssetPriorityAccumulator>,
  snapshots: DailyMoverSnapshot[],
) {
  let count = 0;

  for (const snapshot of snapshots) {
    const reviewsById = new Map(snapshot.reviews.map((review) => [review.id, review]));
    const movers = [...snapshot.gainers, ...snapshot.losers];

    for (const mover of movers) {
      const review = reviewsById.get(mover.id);

      if (review?.attribution.learnability === "not_learnable") {
        continue;
      }

      const accumulator = getAccumulator(accumulators, mover.symbol);

      if (!accumulator) {
        continue;
      }

      accumulator.anomalyScore += dailyMoverAnomalyScore(mover, review);
      accumulator.earlyOpportunityScore = Math.max(
        accumulator.earlyOpportunityScore,
        dailyMoverEarlyOpportunityScore(mover, review),
      );
      accumulator.overextensionRiskScore = Math.max(
        accumulator.overextensionRiskScore,
        dailyMoverOverextensionRiskScore(mover, review),
      );
      accumulator.recentSignalCount += 1;

      if (review?.radarReview.status === "missed") {
        accumulator.missedOpportunities += 1;
      }

      if (review?.radarReview.status === "caught") {
        addHistoricalOutcome(accumulator, true);
      }

      count += 1;
    }
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
  const historyAdjustment = typeof hint.historicalWinRate === "number"
    ? (hint.historicalWinRate - 0.5) * 40
    : 0;
  const earlyOpportunityBoost = (hint.earlyOpportunityScore ?? 0) * 1.5;
  const missedOpportunityBoost = (hint.missedOpportunityCount ?? 0) * 100;
  const overextensionPenalty = (hint.overextensionRiskScore ?? 0) * 1.2;
  const cooldownPenalty = (hint.cooldownReviewCount ?? 0) * 100;

  return (hint.anomalyScore ?? 0) * 4 +
    earlyOpportunityBoost +
    (hint.recentSignalCount ?? 0) * 12 +
    (hint.historicalSampleSize ?? 0) * 4 +
    historyAdjustment +
    (hint.rotationAgeBoost ?? 0) / 10_000 +
    missedOpportunityBoost -
    overextensionPenalty -
    cooldownPenalty -
    (hint.recentDeepScanPenalty ?? 0) / 10_000;
}

function toHint(accumulator: AssetPriorityAccumulator): UniversePriorityHint {
  const historicalWinRate = accumulator.historicalSamples > 0
    ? Number((accumulator.historicalPositive / accumulator.historicalSamples).toFixed(2))
    : undefined;

  return {
    anomalyScore: Math.round(clamp(accumulator.anomalyScore, 0, 100)),
    baseAsset: accumulator.baseAsset,
    cooldownReviewCount: accumulator.cooldownReviews || undefined,
    consecutiveSkipped: accumulator.consecutiveSkipped || undefined,
    deepScanCount1h: accumulator.deepScanCount1h || undefined,
    deepScanCount24h: accumulator.deepScanCount24h || undefined,
    earlyOpportunityScore: accumulator.earlyOpportunityScore || undefined,
    historicalSampleSize: accumulator.historicalSamples || undefined,
    historicalWinRate,
    missedOpportunityCount: accumulator.missedOpportunities || undefined,
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
  const journalHintCounts = addJournalHints(accumulators, journalEvents);
  const sourceCounts: UniversePriorityHintSourceCounts = {
    archives: addArchiveHints(accumulators, archives),
    assetStates: addScanAssetStateHints(accumulators, assetStates),
    dailyMovers: addDailyMoverHints(accumulators, dailyMoverSnapshots),
    journalOutcomes: journalHintCounts.journalOutcomes,
    trendRadarReviews: journalHintCounts.trendRadarReviews,
  };
  const hints = [...accumulators.values()]
    .map(toHint)
    .filter((hint) =>
      (hint.anomalyScore ?? 0) > 0 ||
      (hint.earlyOpportunityScore ?? 0) > 0 ||
      (hint.rotationAgeBoost ?? 0) > 0 ||
      (hint.recentDeepScanPenalty ?? 0) > 0 ||
      (hint.recentSignalCount ?? 0) > 0 ||
      (hint.historicalSampleSize ?? 0) > 0
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
