import assert from "node:assert/strict";
import test from "node:test";

import {
  OPPORTUNITY_LIFECYCLE_STATUSES,
  buildOpportunityLifecycle,
  validateOpportunityLifecycle,
} from "./opportunity-lifecycle";
import type { OpportunityLifecycleEvent, OpportunityLifecycleStatus } from "./types";

const fullStatuses: OpportunityLifecycleStatus[] = [
  "DISCOVERED",
  "CANDIDATE_OBSERVE",
  "DEEP_SCAN_PENDING",
  "EVIDENCE_OBSERVE",
  "WAIT_CONDITION",
  "BLOCKED",
  "TRADE_PLAN_READY",
  "INVALIDATED",
  "EXPIRED",
  "OUTCOME_REVIEWED",
];

test("opportunity lifecycle exposes every required status", () => {
  assert.deepEqual([...OPPORTUNITY_LIFECYCLE_STATUSES].sort(), fullStatuses.sort());
});

test("buildOpportunityLifecycle creates research-only lifecycle timeline", () => {
  const events: OpportunityLifecycleEvent[] = [
    {
      status: "DISCOVERED",
      observedAt: "2026-07-06T00:00:00.000Z",
      sourceLayer: "scan",
      reason: "light scan discovered unusual expansion",
      evidenceIds: ["light-frame-1"],
    },
    {
      status: "CANDIDATE_OBSERVE",
      observedAt: "2026-07-06T00:05:00.000Z",
      sourceLayer: "scan",
      reason: "candidate kept for observation",
    },
    {
      status: "DEEP_SCAN_PENDING",
      observedAt: "2026-07-06T00:12:00.000Z",
      sourceLayer: "scan",
      reason: "queued for derivative evidence",
    },
    {
      status: "EVIDENCE_OBSERVE",
      observedAt: "2026-07-06T00:18:00.000Z",
      sourceLayer: "analysis",
      reason: "evidence exists but strategy gate is not ready",
    },
    {
      status: "WAIT_CONDITION",
      observedAt: "2026-07-06T00:25:00.000Z",
      sourceLayer: "strategy",
      reason: "waiting for retest confirmation",
    },
    {
      status: "TRADE_PLAN_READY",
      observedAt: "2026-07-06T00:40:00.000Z",
      sourceLayer: "strategy",
      reason: "backend strategy facts passed",
    },
    {
      status: "OUTCOME_REVIEWED",
      observedAt: "2026-07-06T04:00:00.000Z",
      sourceLayer: "review",
      reason: "outcome reviewed after the fact",
    },
  ];

  const lifecycle = buildOpportunityLifecycle({
    id: "lifecycle:ENAUSDT:2026-07-06",
    symbol: "enausdt",
    events,
  });

  assert.equal(lifecycle.symbol, "ENAUSDT");
  assert.equal(lifecycle.currentStatus, "OUTCOME_REVIEWED");
  assert.equal(lifecycle.isTerminal, true);
  assert.equal(lifecycle.allowedUse, "research_only");
  assert.equal(lifecycle.canAutoExecute, false);
  assert.equal(lifecycle.canAutoAdjustWeights, false);
  assert.equal(lifecycle.canMutateLiveRanking, false);
  assert.equal(lifecycle.canMutateProductionRanking, false);
  assert.equal(lifecycle.timeline[0]?.sequence, 1);
  assert.match(lifecycle.guardrail, /不能回写 production ranking/u);
});

test("validateOpportunityLifecycle rejects outcome outside review layer and invalid jumps", () => {
  assert.throws(() => validateOpportunityLifecycle([
    {
      status: "DISCOVERED",
      observedAt: "2026-07-06T00:00:00.000Z",
      sourceLayer: "scan",
      reason: "found",
    },
    {
      status: "TRADE_PLAN_READY",
      observedAt: "2026-07-06T00:01:00.000Z",
      sourceLayer: "strategy",
      reason: "invalid jump",
    },
  ]), /transition_violation/u);

  assert.throws(() => validateOpportunityLifecycle([
    {
      status: "TRADE_PLAN_READY",
      observedAt: "2026-07-06T00:00:00.000Z",
      sourceLayer: "strategy",
      reason: "ready",
    },
    {
      status: "OUTCOME_REVIEWED",
      observedAt: "2026-07-06T01:00:00.000Z",
      sourceLayer: "strategy",
      reason: "wrong layer",
    },
  ]), /outcome_must_be_review_layer/u);
});
