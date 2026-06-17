import assert from "node:assert/strict";
import test from "node:test";
import type {
  MarketSignal,
} from "../types";
import type {
  StrategyV3TrendContext,
} from "./types";
import {
  buildV3TradePlan,
} from "./trade-plan";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "coinglass-BINANCE-TESTUSDT",
    symbol: "TESTUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "waiting_confirmation",
    timeframe: "15m",
    regime: "mixed",
    confidence: 72,
    risk: "medium",
    updatedAt: "2026-06-17T10:00:00.000Z",
    summary: "测试信号",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "等待确认",
      invalidation: "结构失效",
      targets: ["前方压力"],
      riskReward: 3,
      positionHint: "观察",
      status: "waiting",
    },
    ...overrides,
  };
}

function trendContext(overrides: Partial<StrategyV3TrendContext> = {}): StrategyV3TrendContext {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    conflicts: [],
    decision: "WAIT_LONG_PULLBACK",
    guardrail: "test guardrail",
    locationRiskReward: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 107.2,
      direction: "long",
      hasTradeSignal: false,
      isTradeEligible: true,
      minRewardRisk: 3,
      nearestTarget: 130,
      positionQuality: "GOOD_LOCATION",
      rewardRisk: 4.03,
      riskFlags: [],
      stopDistance: 7.2,
      stopDistancePercent: 6.72,
      structuralStop: 100,
      summary: "位置合格",
      targetDistance: 22.8,
      targetDistancePercent: 21.27,
      targetLevelId: "target-1",
      stopLevelId: "stop-1",
    },
    marketReadings: [],
    nextStep: "等待回踩承接",
    noParticipationReasons: [],
    reactionQuality: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["回踩触及支撑后收回。"],
      hasTradeSignal: false,
      qualityScore: 78,
      riskFlags: [],
      status: "CONFIRMED",
      summary: "承接确认",
      touchedLevelId: "stop-1",
    },
    riskGate: {
      allowed: true,
      blockedBy: [],
      mode: "readonly_v3_risk_gate",
    },
    scores: {
      exhaustionScore: 22,
      longPreTrendScore: 74,
      longTrendEnergyScore: 76,
      riskScore: 28,
      shortPreTrendScore: 18,
      shortTrendEnergyScore: 12,
      trendHoldScore: 70,
    },
    state: "LONG_BREAKOUT",
    summary: "test trend context",
    timeframes: [],
    trendIntegrity: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["HH/HL 序列保持。"],
      hasTradeSignal: false,
      integrityScore: 82,
      riskFlags: [],
      status: "HEALTHY_TREND",
      summary: "趋势完整",
    },
    ...overrides,
  };
}

test("buildV3TradePlan creates a readonly long draft only when RR reaction trend and risk gate align", () => {
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext(),
  });

  assert.equal(plan.status, "READY_LONG");
  assert.equal(plan.isPlanEligible, true);
  assert.equal(plan.hasAutoExecution, false);
  assert.equal(plan.canMutateLiveRanking, false);
  assert.equal(plan.structuralStop, 100);
  assert.deepEqual(plan.targets, [130]);
  assert.equal(plan.rewardRisk, 4.03);
  assert.match(plan.summary, /只读|多头/);
  assert.match(plan.confirmationChecklist.join(" / "), /回踩|趋势完整度|Risk Gate/);
});

test("buildV3TradePlan blocks the draft when reward risk is below the minimum", () => {
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      locationRiskReward: {
        ...trendContext().locationRiskReward!,
        isTradeEligible: false,
        rewardRisk: 1.4,
        riskFlags: ["reward_risk_below_minimum"],
      },
      riskGate: {
        allowed: false,
        blockedBy: ["reward_risk_below_minimum"],
        mode: "readonly_v3_risk_gate",
      },
    }),
  });

  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.isPlanEligible, false);
  assert.ok(plan.blockedBy.includes("reward_risk_below_minimum"));
});

test("buildV3TradePlan waits for pullback confirmation before drafting a long plan", () => {
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      reactionQuality: {
        ...trendContext().reactionQuality!,
        qualityScore: 46,
        status: "REACTION_STARTED",
      },
    }),
  });

  assert.equal(plan.status, "WAIT_PULLBACK");
  assert.equal(plan.isPlanEligible, false);
  assert.match(plan.summary, /等待回踩/);
});

test("buildV3TradePlan never turns exhaustion risk into an opposite execution signal", () => {
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      trendIntegrity: {
        ...trendContext().trendIntegrity!,
        integrityScore: 38,
        riskFlags: ["upper_wick_exhaustion"],
        status: "EXHAUSTION_RISK",
      },
    }),
  });

  assert.equal(plan.status, "WATCH_ONLY");
  assert.equal(plan.direction, "long");
  assert.equal(plan.hasAutoExecution, false);
  assert.match(plan.summary, /不反向/);
});
