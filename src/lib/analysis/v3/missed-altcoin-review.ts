import type { DailyMoverSnapshotCorrelation } from "../../market/daily-mover-correlations";
import type { TrendRadarReview, V3ForwardMapSnapshot } from "./types";

export type BuildMissedAltcoinReviewsInput = {
  correlation: DailyMoverSnapshotCorrelation | null;
  observedAt: string;
  v3Snapshots: V3ForwardMapSnapshot[];
};

const maxMissedAltcoinReviews = 8;

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function baseSymbol(symbol: string) {
  return symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function matchesSymbol(left: string, right: string) {
  return baseSymbol(left) === baseSymbol(right);
}

function evidenceIds(snapshot: V3ForwardMapSnapshot) {
  return [
    ...snapshot.dossier.forwardLevels.map((level) => level.id),
    ...snapshot.dossier.keyLevels.map((level) => level.id),
  ].slice(0, 8);
}

function latestPriorSnapshot({
  observedAt,
  snapshots,
  symbol,
}: {
  observedAt: string;
  snapshots: V3ForwardMapSnapshot[];
  symbol: string;
}) {
  const observedTime = sortableTime(observedAt);

  return snapshots
    .filter((snapshot) => (
      matchesSymbol(snapshot.symbol, symbol)
      && sortableTime(snapshot.generatedAt) > 0
      && sortableTime(snapshot.generatedAt) <= observedTime
    ))
    .sort((left, right) => sortableTime(right.generatedAt) - sortableTime(left.generatedAt))[0] ?? null;
}

export function buildMissedAltcoinReviews({
  correlation,
  observedAt,
  v3Snapshots,
}: BuildMissedAltcoinReviewsInput): TrendRadarReview[] {
  if (!correlation) {
    return [];
  }

  return correlation.links
    .filter((link) => (
      link.radarStatus === "missed"
      && link.learnability !== "not_learnable"
      && (link.calibrationCandidate || link.improvementTags.length > 0)
    ))
    .flatMap((link): TrendRadarReview[] => {
      const snapshot = latestPriorSnapshot({
        observedAt,
        snapshots: v3Snapshots,
        symbol: link.symbol,
      });

      if (!snapshot) {
        return [];
      }

      const ids = evidenceIds(snapshot);

      if (ids.length === 0) {
        return [];
      }

      return [{
        id: `${correlation.snapshotId}:${link.moverId}:${snapshot.scanId}:missed-altcoin-review`,
        type: "missed_altcoin_review",
        symbol: link.symbol,
        sourceId: `${correlation.snapshotId}:${link.moverId}:${snapshot.scanId}`,
        verdict: "missed",
        detail: `${link.symbol} 出现在每日异动漏判样本中，且 ${snapshot.generatedAt} 已存在事前 v3 地图：${snapshot.dossier.forwardLevels.length} 个 Forward Map 位、${snapshot.dossier.keyLevels.length} 个关键位。该样本只用于人工复盘覆盖率和触发条件，不自动调权。`,
        observedAt,
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        evidenceIds: ids,
      }];
    })
    .slice(0, maxMissedAltcoinReviews);
}
