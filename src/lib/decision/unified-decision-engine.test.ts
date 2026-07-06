import assert from "node:assert/strict";
import test from "node:test";
import type {
  StrategyV3TradePlan,
} from "@/lib/analysis/v3/types";
import {
  buildUnifiedDecision,
} from "./unified-decision-engine";

function plan(overrides: Partial<StrategyV3TradePlan> = {}): StrategyV3TradePlan {
  return {
    allowedUse: "research_only",
    blockedBy: [],
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    confirmationChecklist: ["Risk Gate 已通过"],
    direction: "long",
    entryZone: "多头计划草案",
    hasAutoExecution: false,
    invalidation: "结构失效：跌破 96 作废。",
    isPlanEligible: true,
    manualReviewRequired: true,
    plannedEntryPrice: 100,
    plannedEntryZone: "等待 100 附近确认",
    positionSizing: "人工复核",
    rewardRisk: 3.4,
    secondaryConfirmation: "二次确认：15m 收盘维持触发区上方。",
    status: "READY_LONG",
    structuralStop: 96,
    summary: "后端 v3 多头计划草案。",
    takeProfitPlan: "第一目标 112。",
    targets: [112],
    triggerCondition: "执行触发：回踩承接确认。",
    waitReason: null,
    whyNotNow: null,
    ...overrides,
  };
}

test("buildUnifiedDecision allows READY only with backend maturity full plan RR stop target and no blocker", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "TRADE_PLAN_READY",
    symbol: "TESTUSDT",
    tradePlan: plan(),
  });

  assert.equal(decision.decision, "TRADE_PLAN_READY");
  assert.equal(decision.readyPlan?.rewardRisk, 3.4);
  assert.equal(decision.readyPlan?.structuralStop, 96);
  assert.deepEqual(decision.readyPlan?.targets, [112]);
  assert.equal(decision.canAutoExecute, false);
  assert.equal(decision.canCreateTradePlanFromRegime, false);
  assert.equal(decision.canMutateLiveRanking, false);
});

test("buildUnifiedDecision blocks a READY-looking plan when backend maturity is not ready", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "EVIDENCE_SIGNAL",
    symbol: "TESTUSDT",
    tradePlan: plan(),
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.equal(decision.readyPlan, null);
  assert.ok(decision.blockers.some((item) => item.reason === "backend_maturity_not_ready"));
  assert.equal(
    decision.blockers.every((item) => item.severity === "warning" || item.severity === "critical" || item.severity === "info"),
    true,
  );
});

test("buildUnifiedDecision blocks READY when RR stop target entry or blocker quality fails", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "TRADE_PLAN_READY",
    symbol: "TESTUSDT",
    tradePlan: plan({
      blockedBy: ["reward_risk_below_minimum"],
      plannedEntryPrice: null,
      rewardRisk: 2.9,
      structuralStop: null,
      targets: [],
    }),
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.deepEqual(
    decision.blockers.map((item) => item.reason),
    [
      "reward_risk_below_minimum",
      "missing_structural_stop",
      "missing_structural_target",
      "missing_planned_entry",
      "plan_has_blockers",
    ],
  );
  assert.equal(decision.blockers.every((item) => item.severity === "critical"), true);
});

test("buildUnifiedDecision preserves WAIT only when trigger invalidation confirmation and whyNotNow exist", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "EVIDENCE_SIGNAL",
    symbol: "TESTUSDT",
    tradePlan: plan({
      isPlanEligible: false,
      status: "WAIT_PULLBACK",
      waitReason: "当前位置不追多。",
      whyNotNow: "现在不能直接做：等待回踩承接。",
    }),
  });

  assert.equal(decision.decision, "WAIT");
  assert.match(decision.waitPlan?.trigger ?? "", /执行触发|回踩/);
  assert.match(decision.waitPlan?.invalidation ?? "", /结构失效/);
  assert.match(decision.waitPlan?.confirmation ?? "", /二次确认/);
  assert.match(decision.waitPlan?.whyNotNow ?? "", /现在不能直接做/);
  assert.equal(decision.readyPlan, null);
});

test("buildUnifiedDecision downgrades incomplete WAIT into BLOCKED", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "EVIDENCE_SIGNAL",
    symbol: "TESTUSDT",
    tradePlan: plan({
      isPlanEligible: false,
      secondaryConfirmation: null,
      status: "WAIT_RETEST",
      whyNotNow: null,
    }),
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.equal(decision.blockers[0]?.reason, "wait_quality_incomplete");
});

test("buildUnifiedDecision returns OBSERVE when there is no backend trade plan", () => {
  const decision = buildUnifiedDecision({
    backendMaturity: "DEEP_SCAN_CANDIDATE",
    symbol: "TESTUSDT",
    tradePlan: null,
  });

  assert.equal(decision.decision, "OBSERVE");
  assert.equal(decision.readyPlan, null);
  assert.equal(decision.waitPlan, null);
});
