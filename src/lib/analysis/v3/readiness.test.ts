import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../types";
import type { StrategyV3Dossier, StrategyV3TradePlan, StrategyV3TrendContext } from "./types";
import { evaluateStrategyV3Readiness } from "./readiness";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    confidence: 72,
    direction: "long",
    evidence: [],
    exchange: "BINANCE",
    id: "ena-15m",
    regime: "risk_on",
    risk: "medium",
    state: "waiting_confirmation",
    strategy: {
      bias: "long",
      entry: "等待回踩确认",
      invalidation: "跌回结构位",
      positionHint: "观察",
      riskReward: 3.2,
      status: "waiting",
      targets: ["前高"],
    },
    summary: "测试信号",
    symbol: "ENAUSDT",
    timeframe: "15m",
    updatedAt: "2026-06-20T08:00:00.000Z",
    ...overrides,
  };
}

function trendContext(overrides: Partial<StrategyV3TrendContext> = {}): StrategyV3TrendContext {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    conflicts: [],
    decision: "LONG_PLAN",
    guardrail: "只读复核，不改排序。",
    locationRiskReward: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 10,
      direction: "long",
      hasTradeSignal: false,
      isTradeEligible: true,
      minRewardRisk: 3,
      nearestTarget: 13.2,
      positionQuality: "GOOD_LOCATION",
      rewardRisk: 3.2,
      riskFlags: [],
      stopDistance: 1,
      stopDistancePercent: 10,
      stopLevelId: "support",
      structuralStop: 9,
      summary: "位置合格。",
      targetDistance: 3.2,
      targetDistancePercent: 32,
      targetLevelId: "resistance",
    },
    marketReadings: [],
    nextStep: "进入人工复核。",
    noParticipationReasons: [],
    reactionQuality: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["支撑回踩后收回。"],
      hasTradeSignal: false,
      qualityScore: 80,
      riskFlags: [],
      status: "CONFIRMED",
      summary: "回踩确认。",
      touchedLevelId: "support",
    },
    riskGate: {
      allowed: true,
      blockedBy: [],
      mode: "readonly_v3_risk_gate",
    },
    scores: {
      exhaustionScore: 12,
      longPreTrendScore: 78,
      longTrendEnergyScore: 80,
      riskScore: 24,
      shortPreTrendScore: 15,
      shortTrendEnergyScore: 10,
      trendHoldScore: 70,
    },
    state: "LONG_BREAKOUT",
    summary: "v3 ready context",
    timeframes: [],
    trendIntegrity: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["HH/HL 保持。"],
      hasTradeSignal: false,
      integrityScore: 82,
      riskFlags: [],
      status: "HEALTHY_TREND",
      summary: "趋势健康。",
    },
    ...overrides,
  };
}

function tradePlan(overrides: Partial<StrategyV3TradePlan> = {}): StrategyV3TradePlan {
  return {
    allowedUse: "research_only",
    blockedBy: [],
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    confirmationChecklist: ["Risk Gate 已通过", "位置/RR 不低于 3:1"],
    direction: "long",
    entryZone: "等待回踩确认",
    hasAutoExecution: false,
    invalidation: "跌破 9",
    isPlanEligible: true,
    manualReviewRequired: true,
    positionSizing: "人工确认",
    rewardRisk: 3.2,
    status: "READY_LONG",
    structuralStop: 9,
    summary: "只读多头计划草案。",
    takeProfitPlan: "分批管理",
    targets: [13.2],
    ...overrides,
  };
}

function dossier(overrides: Partial<StrategyV3Dossier> = {}): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 10,
    forwardLevels: [],
    guardrails: ["只读"],
    keyLevels: [],
    primaryTimeframe: "15m",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h"],
    summary: "v3 dossier",
    symbol: "ENAUSDT",
    tradePlan: tradePlan(),
    trendContext: trendContext(),
    ...overrides,
  };
}

test("evaluateStrategyV3Readiness blocks missing v3 context", () => {
  const report = evaluateStrategyV3Readiness(signal());

  assert.equal(report.bucket, "missing_v3");
  assert.equal(report.canEnterManualReview, false);
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canMutateLiveRanking, false);
});

test("evaluateStrategyV3Readiness waits when timeframes conflict", () => {
  const report = evaluateStrategyV3Readiness(signal({
    strategyV3: dossier({
      trendContext: trendContext({
        conflicts: ["15m 上行但 4h 下行。"],
        decision: "CONFLICT_WAIT",
        state: "CONFLICT",
      }),
    }),
  }));

  assert.equal(report.bucket, "conflict_wait");
  assert.match(report.blockers.join(" / "), /4h/);
});

test("evaluateStrategyV3Readiness blocks reward risk below three to one", () => {
  const report = evaluateStrategyV3Readiness(signal({
    strategyV3: dossier({
      tradePlan: tradePlan({
        blockedBy: ["reward_risk_below_minimum"],
        isPlanEligible: false,
        rewardRisk: 2.2,
        status: "BLOCKED",
      }),
      trendContext: trendContext({
        locationRiskReward: {
          ...trendContext().locationRiskReward!,
          isTradeEligible: false,
          rewardRisk: 2.2,
          riskFlags: ["reward_risk_below_minimum"],
        },
      }),
    }),
  }));

  assert.equal(report.bucket, "rr_blocked");
  assert.equal(report.canEnterManualReview, false);
  assert.match(report.summary, /3:1/);
});

test("evaluateStrategyV3Readiness keeps waiting setups out of manual readiness", () => {
  const report = evaluateStrategyV3Readiness(signal({
    strategyV3: dossier({
      tradePlan: tradePlan({
        blockedBy: ["reaction_not_confirmed"],
        isPlanEligible: false,
        status: "WAIT_PULLBACK",
      }),
    }),
  }));

  assert.equal(report.bucket, "wait_reaction");
  assert.equal(report.canEnterManualReview, false);
});

test("evaluateStrategyV3Readiness marks fully gated v3 setups as manual review only", () => {
  const report = evaluateStrategyV3Readiness(signal({
    strategyV3: dossier(),
  }));

  assert.equal(report.bucket, "manual_review_ready");
  assert.equal(report.canEnterManualReview, true);
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canMutateLiveRanking, false);
  assert.match(report.nextStep, /人工复核/);
});
