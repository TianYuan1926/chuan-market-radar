import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  ForwardLevel,
  TrendRadarReview,
  TrendRadarReviewVerdict,
} from "./types";

export type BuildForwardMapReviewInput = {
  futureCandles: Candle[];
  levels: ForwardLevel[];
  observedAt: string;
  sourceId: string;
  symbol: string;
};

function levelWasReached(level: ForwardLevel, candle: Candle) {
  return candle.low <= level.zoneHigh && candle.high >= level.zoneLow;
}

function supportReclaimed(level: ForwardLevel, futureCandles: Candle[]) {
  return futureCandles.some((candle) => candle.close > level.zoneHigh);
}

function resistanceRejected(level: ForwardLevel, futureCandles: Candle[]) {
  return futureCandles.some((candle) => candle.close < level.zoneLow);
}

function levelInvalidated(level: ForwardLevel, futureCandles: Candle[]) {
  return level.side === "SUPPORT"
    ? futureCandles.some((candle) => candle.close < level.zoneLow)
    : futureCandles.some((candle) => candle.close > level.zoneHigh);
}

function verdictFor(level: ForwardLevel, futureCandles: Candle[]): TrendRadarReviewVerdict {
  const reachedIndex = futureCandles.findIndex((candle) => levelWasReached(level, candle));

  if (reachedIndex === -1) {
    return "pending";
  }

  const afterReach = futureCandles.slice(reachedIndex);

  if (level.side === "SUPPORT" && supportReclaimed(level, afterReach)) {
    return "reaction_confirmed";
  }

  if (level.side === "RESISTANCE" && resistanceRejected(level, afterReach)) {
    return "reaction_confirmed";
  }

  if (levelInvalidated(level, afterReach)) {
    return "invalidated";
  }

  return "needs_more_evidence";
}

export function buildForwardMapReview({
  futureCandles,
  levels,
  observedAt,
  sourceId,
  symbol,
}: BuildForwardMapReviewInput): TrendRadarReview {
  const reached = levels.find((level) => futureCandles.some((candle) => levelWasReached(level, candle)));
  const level = reached ?? levels[0];
  const verdict = level ? verdictFor(level, futureCandles) : "pending";
  const detail = level
    ? `${level.role} ${level.zoneLow}-${level.zoneHigh} review verdict: ${verdict}.`
    : "No prebuilt forward level was available for review.";

  return {
    id: `${sourceId}-${symbol}-forward-map-review`,
    type: "forward_map_review",
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
