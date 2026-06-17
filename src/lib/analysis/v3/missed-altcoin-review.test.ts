import assert from "node:assert/strict";
import test from "node:test";

import type { DailyMoverSnapshotCorrelation } from "../../market/daily-mover-correlations";
import type { StrategyV3Dossier, V3ForwardMapSnapshot } from "./types";
import { buildMissedAltcoinReviews } from "./missed-altcoin-review";

function dossier(symbol: string): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 100,
    forwardLevels: [
      {
        id: `${symbol}-support-s1`,
        symbol,
        side: "SUPPORT",
        role: "CURRENT_DEFENSE",
        zoneLow: 94,
        zoneHigh: 96,
        timeframeWeight: 4,
        keyScore: 82,
        status: "AHEAD",
        reasons: ["4h swing low"],
        confirmationRules: ["15m reclaim zoneHigh"],
        invalidationRules: ["1h close below zoneLow"],
        sourceLevelIds: [`${symbol}-4h-swing-low`],
      },
    ],
    guardrails: ["manual review only"],
    keyLevels: [
      {
        id: `${symbol}-4h-swing-low`,
        symbol,
        timeframe: "4h",
        type: "SWING_LOW",
        zoneLow: 94,
        zoneHigh: 96,
        midPrice: 95,
        direction: "SUPPORT",
        keyScore: 80,
        reactionScore: 40,
        confluenceScore: 72,
        status: "POTENTIAL",
        reasons: ["4h swing low"],
        confirmationRules: ["reclaim 96"],
        invalidationRule: "close below 94",
      },
    ],
    primaryTimeframe: "4h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h", "4h"],
    summary: "Readonly v3 map.",
    symbol,
  };
}

function v3Snapshot(symbol: string, generatedAt = "2026-06-15T00:00:00.000Z"): V3ForwardMapSnapshot {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    dossier: dossier(symbol),
    generatedAt,
    scanId: "scan-v3-map",
    signalId: `${symbol.toLowerCase()}-signal`,
    symbol,
  };
}

function correlation(): DailyMoverSnapshotCorrelation {
  return {
    snapshotId: "daily-movers-2026-06-15",
    observedAt: "2026-06-15T04:00:00.000Z",
    summary: {
      calibrationCandidates: 1,
      caught: 0,
      journalLinked: 0,
      missed: 1,
      notLearnable: 0,
      scanLinked: 0,
    },
    links: [
      {
        calibrationCandidate: true,
        direction: "gainer",
        improvementTags: ["review_volume_oi_weight"],
        journalActions: [],
        journalEventIds: [],
        learnability: "watchlist",
        linkedSignals: [],
        matchedScanIds: [],
        matchedSignalIds: [],
        moverId: "enausdt-gainer-1",
        radarStatus: "missed",
        status: "missed_with_evidence",
        suggestedNextStep: "纳入规则校准候选。",
        symbol: "ENAUSDT",
      },
      {
        calibrationCandidate: false,
        direction: "loser",
        improvementTags: [],
        journalActions: [],
        journalEventIds: [],
        learnability: "not_learnable",
        linkedSignals: [],
        matchedScanIds: [],
        matchedSignalIds: [],
        moverId: "oldusdt-loser-1",
        radarStatus: "not_learnable",
        status: "not_learnable",
        suggestedNextStep: "保留反例。",
        symbol: "OLDUSDT",
      },
    ],
  };
}

test("buildMissedAltcoinReviews creates readonly missed_altcoin_review from missed daily movers and saved v3 maps", () => {
  const reviews = buildMissedAltcoinReviews({
    correlation: correlation(),
    observedAt: "2026-06-15T04:00:00.000Z",
    v3Snapshots: [v3Snapshot("ENAUSDT")],
  });

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.type, "missed_altcoin_review");
  assert.equal(reviews[0]?.symbol, "ENAUSDT");
  assert.equal(reviews[0]?.verdict, "missed");
  assert.equal(reviews[0]?.allowedUse, "research_only");
  assert.equal(reviews[0]?.canAutoAdjustWeights, false);
  assert.deepEqual(reviews[0]?.evidenceIds, ["ENAUSDT-support-s1", "ENAUSDT-4h-swing-low"]);
  assert.match(reviews[0]?.detail ?? "", /事前 v3 地图/);
  assert.match(reviews[0]?.detail ?? "", /不自动调权/);
});

test("buildMissedAltcoinReviews ignores future v3 maps and non-learnable movers", () => {
  const reviews = buildMissedAltcoinReviews({
    correlation: correlation(),
    observedAt: "2026-06-15T04:00:00.000Z",
    v3Snapshots: [
      v3Snapshot("ENAUSDT", "2026-06-15T05:00:00.000Z"),
      v3Snapshot("OLDUSDT", "2026-06-15T00:00:00.000Z"),
    ],
  });

  assert.deepEqual(reviews, []);
});
