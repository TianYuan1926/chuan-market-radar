import assert from "node:assert/strict";
import test from "node:test";
import type { ReadyStrategyDecision, StrategyDecision } from "./contracts";
import {
  assertValidStrategyDecision,
  validateStrategyDecision,
} from "./strategy-decision-validation";

function baseDecision(): Omit<ReadyStrategyDecision, "actionState" | "executablePlan"> {
  return {
    contentHash: "sha256:fixture-decision",
    decidedAt: "2026-01-15T00:01:00.000Z",
    decisionId: "decision-fixture-1",
    draftId: "draft-fixture-1",
    episodeId: "episode-fixture-1",
    feasibilityId: "feasibility-fixture-1",
    generatedAt: "2026-01-15T00:01:00.000Z",
    producerModule: "execution_feasibility_final_decision",
    reasonCodes: ["all_hard_gates_passed"],
    releaseId: "release-fixture-1",
    schemaVersion: "strategy-decision.v1",
    sourceCutoff: "2026-01-15T00:00:59.000Z",
  };
}

function validReadyDecision(): ReadyStrategyDecision {
  return {
    ...baseDecision(),
    actionState: "TRADE_PLAN_READY",
    executablePlan: {
      direction: "LONG",
      entryTrigger: "1m close and retest acceptance above fixture level",
      expiresAt: "2026-01-15T00:16:00.000Z",
      estimatedNetRewardRisk: 3.1,
      noChaseCondition: "Do not enter above the planned zone",
      planId: "plan-fixture-1",
      plannedEntryZone: {
        lower: "100.00",
        sourceLevelIds: ["level-fixture-1"],
        upper: "101.00",
      },
      structuralInvalidation: "Structure closes below the reclaimed level",
      structuralRewardRisk: 3.2,
      structuralStop: "98.50",
      targets: [
        {
          allocationPercent: 100,
          price: "108.50",
          source: "PRIOR_EXTREME",
          sourceLevelIds: ["level-fixture-2"],
          targetId: "target-fixture-1",
        },
      ],
    },
  };
}

test("accepts a complete ready decision at or above both RR floors", () => {
  const decision = validReadyDecision();
  assert.deepEqual(validateStrategyDecision(decision), []);
  assert.doesNotThrow(() => assertValidStrategyDecision(decision));
});

test("rejects a ready decision below structural or net RR", () => {
  const decision = validReadyDecision();
  const invalid = {
    ...decision,
    executablePlan: {
      ...decision.executablePlan,
      estimatedNetRewardRisk: 2.9,
      structuralRewardRisk: 2.8,
    },
  } as ReadyStrategyDecision;

  assert.deepEqual(
    validateStrategyDecision(invalid).map((issue) => issue.code),
    ["structural_rr_below_minimum", "net_rr_below_minimum"],
  );
});

test("keeps every non-ready state planless", () => {
  const nonReadyStates = ["OBSERVE", "WAIT", "BLOCKED"] as const;

  for (const actionState of nonReadyStates) {
    const decision: StrategyDecision = {
      ...baseDecision(),
      actionState,
      executablePlan: null,
    };
    assert.deepEqual(validateStrategyDecision(decision), []);
  }
});
