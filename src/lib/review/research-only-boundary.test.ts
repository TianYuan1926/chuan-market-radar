import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REVIEW_RESEARCH_ONLY_GUARD,
  assertResearchOnlyBoundary,
  createResearchOnlyLifecycleRecord,
} from "./research-only-boundary";

test("research-only lifecycle records cannot mutate production", () => {
  const record = createResearchOnlyLifecycleRecord({
    id: "shadow:TIAUSDT",
    symbol: "TIAUSDT",
    stage: "EVIDENCE_SIGNAL",
    observedAt: "2026-07-05T00:00:00.000Z",
    source: "current_signal",
  });

  assert.equal(record.allowedUse, "research_only");
  assert.equal(record.canAutoExecute, false);
  assert.equal(record.canAutoAdjustWeights, false);
  assert.equal(record.canMutateLiveRanking, false);
  assert.equal(record.metrics.mfePercent, null);
  assert.match(record.guardrail, /不能污染 production ranking/u);
});

test("research boundary rejects automatic action flags", () => {
  assert.throws(() => assertResearchOnlyBoundary({
    allowedUse: "research_only",
    canAutoExecute: true as false,
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
  }), /auto_execute/u);

  assert.throws(() => assertResearchOnlyBoundary({
    allowedUse: "research_only",
    canAutoExecute: false,
    canAutoAdjustWeights: true as false,
    canMutateLiveRanking: false,
  }), /auto_adjust_weights/u);
});

test("guard constants stay locked to research only", () => {
  assert.deepEqual(REVIEW_RESEARCH_ONLY_GUARD, {
    allowedUse: "research_only",
    canAutoExecute: false,
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    guardrail: "lifecycle/outcome 只能用于复盘研究和改进建议，不能污染 production ranking。",
  });
});
