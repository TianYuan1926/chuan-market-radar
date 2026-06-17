import type { JournalEvent } from "../types";
import type { Candle, OhlcvInterval, OhlcvProvider } from "../../market/ohlcv/types";
import type { PersistenceRepository } from "../../persistence/persistence-store";
import { buildForwardMapReview } from "./forward-map-review";
import type {
  KeyLevel,
  TrendRadarReview,
  TrendRadarReviewRunSummary,
  TrendRadarReviewSkipReasonCode,
  TrendRadarReviewSkipReasonSummary,
  V3ForwardMapSnapshot,
} from "./types";

export type ForwardMapReviewExecutorFailure = TrendRadarReviewRunSummary["failures"][number];

export type ForwardMapReviewExecutorResult = TrendRadarReviewRunSummary & {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  mode: "v3_forward_map_review_executor_mvp";
};

export type RunForwardMapReviewExecutorOptions = {
  limit?: number;
  now?: string;
  ohlcvProvider: OhlcvProvider;
  repository: PersistenceRepository;
};

const defaultSnapshotLimit = 80;
const defaultCandleLimit = 200;
const supportedIntervals = new Set<OhlcvInterval>([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
]);

const skipReasonMeta: Record<TrendRadarReviewSkipReasonCode, { label: string; order: number }> = {
  no_forward_levels: { label: "缺少事前地图", order: 10 },
  no_future_candles: { label: "缺少后续K线", order: 20 },
  ohlcv_unavailable: { label: "行情请求失败", order: 30 },
  unsupported_timeframe: { label: "周期不支持", order: 40 },
};

function emptyResult(): ForwardMapReviewExecutorResult {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    failedFetches: 0,
    failures: [],
    fetchedCandles: 0,
    mode: "v3_forward_map_review_executor_mvp",
    reviewedSnapshots: 0,
    scannedSnapshots: 0,
    skippedReasons: [],
    skippedSnapshots: 0,
    writtenEvents: 0,
  };
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isSupportedInterval(value: string): value is OhlcvInterval {
  return supportedIntervals.has(value as OhlcvInterval);
}

function reviewInterval(snapshot: V3ForwardMapSnapshot): OhlcvInterval | null {
  const primary = snapshot.dossier.primaryTimeframe;

  return isSupportedInterval(primary) ? primary : null;
}

function futureCandles(candles: Candle[], generatedAt: string) {
  const generatedTime = sortableTime(generatedAt);

  return candles.filter((candle) => sortableTime(candle.closeTime) > generatedTime);
}

function levelWasReached(level: KeyLevel, candle: Candle) {
  return candle.low <= level.zoneHigh && candle.high >= level.zoneLow;
}

function keyLevelReactionVerdict(level: KeyLevel, candles: Candle[]): TrendRadarReview["verdict"] {
  const reachedIndex = candles.findIndex((candle) => levelWasReached(level, candle));

  if (reachedIndex === -1) {
    return "pending";
  }

  const afterReach = candles.slice(reachedIndex);

  if (level.direction === "SUPPORT") {
    if (afterReach.some((candle) => candle.close > level.zoneHigh)) {
      return "reaction_confirmed";
    }

    if (afterReach.some((candle) => candle.close < level.zoneLow)) {
      return "invalidated";
    }
  }

  if (level.direction === "RESISTANCE") {
    if (afterReach.some((candle) => candle.close < level.zoneLow)) {
      return "reaction_confirmed";
    }

    if (afterReach.some((candle) => candle.close > level.zoneHigh)) {
      return "invalidated";
    }
  }

  return "needs_more_evidence";
}

function buildKeyLevelReactionReview({
  futureCandles: candles,
  levels,
  observedAt,
  sourceId,
  symbol,
}: {
  futureCandles: Candle[];
  levels: KeyLevel[];
  observedAt: string;
  sourceId: string;
  symbol: string;
}): TrendRadarReview {
  const reached = levels.find((level) => candles.some((candle) => levelWasReached(level, candle)));
  const level = reached ?? levels[0];
  const verdict = level ? keyLevelReactionVerdict(level, candles) : "pending";
  const detail = level
    ? `${level.type} ${level.zoneLow}-${level.zoneHigh} reaction review verdict: ${verdict}.`
    : "No prebuilt key level was available for review.";

  return {
    id: `${sourceId}-${symbol}-key-level-reaction-review`,
    type: "key_level_reaction_review",
    symbol,
    sourceId,
    verdict,
    detail,
    observedAt,
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    evidenceIds: level ? [level.id] : [],
  };
}

function addSkippedReason(
  result: ForwardMapReviewExecutorResult,
  code: TrendRadarReviewSkipReasonCode,
  symbol: string,
) {
  const meta = skipReasonMeta[code];
  const existing = result.skippedReasons.find((item) => item.code === code);

  result.skippedSnapshots += 1;

  if (existing) {
    existing.count += 1;

    if (!existing.symbols.includes(symbol)) {
      existing.symbols.push(symbol);
    }

    return;
  }

  result.skippedReasons.push({
    code,
    count: 1,
    label: meta.label,
    symbols: [symbol],
  });
}

function normalizedSkippedReasons(reasons: TrendRadarReviewSkipReasonSummary[]) {
  return [...reasons]
    .map((reason) => ({
      ...reason,
      symbols: [...reason.symbols].sort(),
    }))
    .sort((left, right) => skipReasonMeta[left.code].order - skipReasonMeta[right.code].order);
}

function reviewEvent(review: TrendRadarReview, now: string): JournalEvent {
  return {
    id: `journal-${review.id}`,
    symbol: review.symbol,
    title: review.type === "forward_map_review" ? "v3 Forward Map 复盘" : "v3 关键位反应复盘",
    result: "watching",
    note: review.detail,
    rankDelta: 0,
    createdAt: now,
    action: "trend_radar_review",
    reviewStatus: "closed",
    source: "trend_radar_review_executor",
    sourceId: review.sourceId,
    lessons: ["trend_radar_review", review.type, review.verdict],
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    trendRadarReview: review,
  };
}

function runEventId(now: string) {
  return `journal-v3-forward-map-review-${now
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function runNote(summary: TrendRadarReviewRunSummary) {
  const failureText = summary.failedFetches > 0
    ? `，失败 ${summary.failedFetches}`
    : "";
  const skippedText = summary.skippedSnapshots > 0
    ? `，跳过 ${summary.skippedSnapshots}`
    : "";

  return `v3 Forward Map 复盘执行：扫描 ${summary.scannedSnapshots}，完成 ${summary.reviewedSnapshots}，写回 ${summary.writtenEvents}${skippedText}${failureText}。`;
}

function runSummary(result: ForwardMapReviewExecutorResult): TrendRadarReviewRunSummary {
  return {
    failedFetches: result.failedFetches,
    failures: result.failures,
    fetchedCandles: result.fetchedCandles,
    reviewedSnapshots: result.reviewedSnapshots,
    scannedSnapshots: result.scannedSnapshots,
    skippedReasons: normalizedSkippedReasons(result.skippedReasons),
    skippedSnapshots: result.skippedSnapshots,
    writtenEvents: result.writtenEvents,
  };
}

function buildRunEvent(result: ForwardMapReviewExecutorResult, now: string): JournalEvent {
  const summary = runSummary(result);

  return {
    id: runEventId(now),
    symbol: "V3_FORWARD_MAP_REVIEW",
    title: "v3 Forward Map 复盘执行批次",
    result: "watching",
    note: runNote(summary),
    rankDelta: 0,
    createdAt: now,
    action: "trend_radar_review_run",
    reviewStatus: "closed",
    source: "trend_radar_review_executor",
    lessons: ["trend_radar_review_run", summary.failedFetches > 0 ? "executor_attention" : "executor_checked"],
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    trendRadarReviewRun: summary,
  };
}

async function writeReviews({
  now,
  repository,
  result,
  reviews,
}: {
  now: string;
  repository: PersistenceRepository;
  result: ForwardMapReviewExecutorResult;
  reviews: TrendRadarReview[];
}) {
  for (const review of reviews) {
    await repository.addJournalEvent(reviewEvent(review, now));
    result.writtenEvents += 1;
  }
}

export async function runForwardMapReviewExecutor({
  limit = defaultSnapshotLimit,
  now = new Date().toISOString(),
  ohlcvProvider,
  repository,
}: RunForwardMapReviewExecutorOptions): Promise<ForwardMapReviewExecutorResult> {
  const result = emptyResult();
  const snapshots = await repository.listV3ForwardMapSnapshots(limit);

  result.scannedSnapshots = snapshots.length;

  for (const snapshot of snapshots) {
    const interval = reviewInterval(snapshot);

    if (!interval) {
      addSkippedReason(result, "unsupported_timeframe", snapshot.symbol);
      continue;
    }

    if (snapshot.dossier.forwardLevels.length === 0 && snapshot.dossier.keyLevels.length === 0) {
      addSkippedReason(result, "no_forward_levels", snapshot.symbol);
      continue;
    }

    const response = await ohlcvProvider.fetchCandles({
      symbol: snapshot.symbol,
      interval,
      limit: defaultCandleLimit,
    });

    if (!response.ok) {
      result.failedFetches += 1;
      addSkippedReason(result, "ohlcv_unavailable", snapshot.symbol);
      result.failures.push({
        error: response.error,
        reason: response.reason,
        scanId: snapshot.scanId,
        signalId: snapshot.signalId,
        symbol: snapshot.symbol,
      });
      continue;
    }

    const candles = futureCandles(response.candles, snapshot.generatedAt);
    result.fetchedCandles += candles.length;

    if (candles.length === 0) {
      addSkippedReason(result, "no_future_candles", snapshot.symbol);
      continue;
    }

    const sourceId = `${snapshot.scanId}:${snapshot.signalId}`;
    const reviews: TrendRadarReview[] = [];

    if (snapshot.dossier.forwardLevels.length > 0) {
      reviews.push(buildForwardMapReview({
        futureCandles: candles,
        levels: snapshot.dossier.forwardLevels,
        observedAt: now,
        sourceId,
        symbol: snapshot.symbol,
      }));
    }

    if (snapshot.dossier.keyLevels.length > 0) {
      reviews.push(buildKeyLevelReactionReview({
        futureCandles: candles,
        levels: snapshot.dossier.keyLevels,
        observedAt: now,
        sourceId,
        symbol: snapshot.symbol,
      }));
    }

    await writeReviews({ now, repository, result, reviews });
    result.reviewedSnapshots += 1;
  }

  result.skippedReasons = normalizedSkippedReasons(result.skippedReasons);
  await repository.addJournalEvent(buildRunEvent(result, now));

  return result;
}
