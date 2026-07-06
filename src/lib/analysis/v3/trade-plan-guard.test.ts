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
      rewardRisk: 4.38,
      riskFlags: [],
      stopDistance: 5.2,
      stopDistancePercent: 4.85,
      structuralStop: 102,
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

test("trade plan guard blocks low-RR plans instead of promoting them to READY", () => {
  const base = trendContext();
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      locationRiskReward: {
        ...base.locationRiskReward!,
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
  assert.equal(plan.hasAutoExecution, false);
  assert.equal(plan.canMutateLiveRanking, false);
});

test("trade plan guard respects risk gate even when RR looks acceptable", () => {
  const base = trendContext();
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      locationRiskReward: {
        ...base.locationRiskReward!,
        isTradeEligible: true,
        rewardRisk: 4.38,
        riskFlags: [],
      },
      riskGate: {
        allowed: false,
        blockedBy: ["high_timeframe_conflict"],
        mode: "readonly_v3_risk_gate",
      },
    }),
  });

  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.isPlanEligible, false);
  assert.ok(plan.blockedBy.includes("high_timeframe_conflict"));
});

test("range compression stays WAIT or WATCH and cannot become a ready trade plan", () => {
  const plan = buildV3TradePlan({
    currentPrice: 107.2,
    signal: signal({ direction: "long" }),
    trendContext: trendContext({
      decision: "WAIT_LONG_BREAKOUT",
      state: "RANGE_COMPRESSION",
      riskGate: {
        allowed: true,
        blockedBy: [],
        mode: "readonly_v3_risk_gate",
      },
    }),
  });

  assert.notEqual(plan.status, "READY_LONG");
  assert.notEqual(plan.status, "READY_SHORT");
  assert.equal(plan.isPlanEligible, false);
  assert.ok(plan.status === "WAIT_RETEST" || plan.status === "WAIT_PULLBACK" || plan.status === "BLOCKED");
});
