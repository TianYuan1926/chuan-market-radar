import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SINGLE_SOURCE_OF_TRUTH_FACTS,
  assertFrontendMayNotCompute,
  singleSourceFact,
  singleSourceTruthSummary,
  type CoreFactId,
} from "./single-source-of-truth";

const REQUIRED_FACTS: CoreFactId[] = [
  "tradePlanReady",
  "candidateCount",
  "anomalyCount",
  "radarSignals",
  "scanFreshness",
  "dataSourceStatus",
  "reviewLatestReport",
  "sniperBoardTargets",
  "waitBlockedReady",
  "servedCacheStalePartial",
  "frontendChineseLabels",
  "businessAllowedUse",
  "canAutoExecute",
  "canAutoAdjustWeights",
  "canMutateLiveRanking",
];

test("single source of truth registry covers all required core facts", () => {
  assert.deepEqual(Object.keys(SINGLE_SOURCE_OF_TRUTH_FACTS).sort(), [...REQUIRED_FACTS].sort());
  for (const fact of REQUIRED_FACTS) {
    const definition = singleSourceFact(fact);
    assert.equal(definition.id, fact);
    assert.ok(definition.sourceOfTruth.length > 0);
    assert.ok(definition.guardrail.length > 0);
    assert.equal(definition.reviewMayMutateProduction, false);
    assert.equal(definition.fallbackMayPretendLive, false);
  }
});

test("frontend cannot author trade readiness, sniper targets, or live ranking mutations", () => {
  for (const fact of [
    "tradePlanReady",
    "sniperBoardTargets",
    "canAutoExecute",
    "canAutoAdjustWeights",
    "canMutateLiveRanking",
  ] as const) {
    assert.equal(singleSourceFact(fact).frontendMayCompute, false);
    assert.throws(() => assertFrontendMayNotCompute(fact), new RegExp(`frontend_may_not_compute:${fact}`));
  }
});

test("review and backtest facts remain research-only consumers", () => {
  assert.match(singleSourceFact("reviewLatestReport").guardrail, /不能回写实时排序/u);
  assert.match(singleSourceFact("canAutoAdjustWeights").guardrail, /不能自动改权重/u);
  assert.match(singleSourceFact("canMutateLiveRanking").guardrail, /不得污染 production ranking/u);
});

test("truth summary is stable and audit-friendly", () => {
  const summary = singleSourceTruthSummary();
  assert.equal(summary.length, REQUIRED_FACTS.length);
  assert.ok(summary.some((line) => line.includes("tradePlanReady")));
  assert.ok(summary.some((line) => line.includes("servedCacheStalePartial")));
});
