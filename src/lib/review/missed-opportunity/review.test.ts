import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSED_REASONS,
  assertMissedOpportunityResearchOnly,
  buildMissedOpportunityReview,
  classifyMissedReason,
} from "./review";
import type { MissedReason, MissedOpportunityCheckpoint } from "./types";

const baseCheckpoint: MissedOpportunityCheckpoint = {
  scanCovered: true,
  lightScanTriggered: true,
  deepScanPendingMinutes: 0,
  analysisHadPriorStructure: true,
  strategyBlockedByRules: false,
  dataSourceAvailable: true,
  marketRegimeAllowed: true,
  frontendHighlighted: true,
  sufficientData: true,
};

const reasonCases: Array<[MissedReason, MissedOpportunityCheckpoint]> = [
  ["scan_not_covered", { ...baseCheckpoint, scanCovered: false }],
  ["light_scan_not_triggered", { ...baseCheckpoint, lightScanTriggered: false }],
  ["deep_scan_pending_too_long", { ...baseCheckpoint, deepScanPendingMinutes: 45 }],
  ["analysis_missed_structure", { ...baseCheckpoint, analysisHadPriorStructure: false }],
  ["strategy_blocked_too_strict", { ...baseCheckpoint, strategyBlockedByRules: true }],
  ["data_source_missing", { ...baseCheckpoint, dataSourceAvailable: false }],
  ["market_regime_filtered", { ...baseCheckpoint, marketRegimeAllowed: false }],
  ["frontend_not_highlighted", { ...baseCheckpoint, frontendHighlighted: false }],
  ["insufficient_data", { ...baseCheckpoint, sufficientData: false }],
];

test("classifyMissedReason supports every required missed reason", () => {
  assert.deepEqual(
    [...MISSED_REASONS].sort(),
    reasonCases.map(([reason]) => reason).sort(),
  );

  for (const [reason, checkpoint] of reasonCases) {
    assert.equal(classifyMissedReason(checkpoint), reason);
  }
});

test("buildMissedOpportunityReview creates research-only missed opportunity record", () => {
  const review = buildMissedOpportunityReview({
    id: "missed:ENAUSDT:2026-07-06T00:00:00.000Z",
    symbol: "enausdt",
    observedAt: "2026-07-06T01:00:00.000Z",
    opportunityObservedAt: "2026-07-06T00:00:00.000Z",
    opportunityMovePercent: 18.5,
    checkpoint: { ...baseCheckpoint, deepScanPendingMinutes: 62 },
    evidenceIds: ["light-scan-frame-1", "daily-mover-1"],
    notes: ["research sample only"],
  });

  assert.equal(review.symbol, "ENAUSDT");
  assert.equal(review.missedReason, "deep_scan_pending_too_long");
  assert.equal(review.chainStage, "deep_scan");
  assert.equal(review.allowedUse, "research_only");
  assert.equal(review.canAutoExecute, false);
  assert.equal(review.canAutoAdjustWeights, false);
  assert.equal(review.canMutateLiveRanking, false);
  assert.equal(review.canMutateProductionRanking, false);
  assert.deepEqual(review.prohibitedUse, [
    "production_ranking",
    "live_scan_priority",
    "strategy_gate_relaxation",
    "auto_weight_adjustment",
    "auto_trade",
  ]);
  assert.match(review.detail, /不能|只/u);
});

test("missed opportunity boundary rejects production mutation flags", () => {
  assert.throws(() => assertMissedOpportunityResearchOnly({
    allowedUse: "research_only",
    canAutoExecute: false,
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    canMutateProductionRanking: true as false,
  }), /production_ranking/u);
});
