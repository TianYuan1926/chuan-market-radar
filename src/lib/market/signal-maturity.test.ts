import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import type { StrategyV3Dossier, StrategyV3TradePlan } from "../analysis/v3/types";
import {
  applySignalMaturity,
  buildSignalMaturityDiagnostics,
  classifyLightScanMaturity,
  classifySignalMaturity,
} from "./signal-maturity";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "ena-signal",
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "waiting_confirmation",
    timeframe: "15m",
    regime: "mixed",
    confidence: 72,
    risk: "medium",
    updatedAt: "2026-06-21T10:00:00.000Z",
    summary: "test signal",
    evidence: [
      {
        label: "Volume expansion",
        value: "成交量放大。",
        layer: "price_volume",
        polarity: "supportive",
      },
    ],
    strategy: {
      bias: "long",
      entry: "wait confirmation",
      invalidation: "range lost",
      positionHint: "wait",
      riskReward: 3.2,
      status: "waiting",
      targets: ["R1"],
    },
    ...overrides,
  };
}

function strategyV3WithTradePlan(overrides: Partial<StrategyV3TradePlan> = {}): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 1,
    forwardLevels: [],
    guardrails: ["readonly"],
    keyLevels: [],
    primaryTimeframe: "1h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h"],
    summary: "v3",
    symbol: "ENAUSDT",
    tradePlan: {
      allowedUse: "research_only",
      blockedBy: [],
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      confirmationChecklist: ["retest"],
      direction: "long",
      entryZone: "0.98-1.02",
      hasAutoExecution: false,
      invalidation: "0.95 lost",
      isPlanEligible: true,
      manualReviewRequired: true,
      positionSizing: "small",
      rewardRisk: 3.6,
      status: "READY_LONG",
      structuralStop: 0.95,
      summary: "manual plan ready",
      takeProfitPlan: "scale out",
      targets: [1.1, 1.2],
      ...overrides,
    },
  };
}

test("classifyLightScanMaturity keeps light-scan marks out of frontend signal lanes", () => {
  const maturity = classifyLightScanMaturity({
    baseAsset: "MANTA",
    changePercent24h: 4.2,
    distanceFromHighPercent: 1.8,
    distanceFromLowPercent: 12,
    reasons: ["volume_price_anomaly"],
    score: 88,
    state: "PRE_TREND",
    symbol: "MANTAUSDT",
    volume24hUsd: 80_000_000,
    volatilityPercent: 7.1,
  });

  assert.equal(maturity.stage, "LIGHT_SCAN_MARK");
  assert.equal(maturity.canEnterMainSignalArea, false);
  assert.equal(maturity.canAttachTradePlan, false);
  assert.equal(maturity.canRequestAiReview, false);
});

test("classifySignalMaturity separates deep-scan candidates from evidence-backed signals", () => {
  const candidate = classifySignalMaturity(signal({
    evidence: [],
    state: "insufficient_data",
    strategy: {
      bias: "neutral",
      entry: "no plan",
      invalidation: "missing data",
      positionHint: "blocked",
      riskReward: 0,
      status: "blocked",
      targets: [],
    },
  }));
  const evidence = classifySignalMaturity(signal());

  assert.equal(candidate.stage, "DEEP_SCAN_CANDIDATE");
  assert.equal(candidate.canEnterMainSignalArea, false);
  assert.equal(evidence.stage, "EVIDENCE_SIGNAL");
  assert.equal(evidence.canEnterMainSignalArea, true);
  assert.equal(evidence.canAttachTradePlan, false);
});

test("classifySignalMaturity only promotes eligible plans to TRADE_PLAN_READY", () => {
  const ready = classifySignalMaturity(signal({
    state: "near_trigger",
    strategy: {
      bias: "long",
      entry: "retest",
      invalidation: "range lost",
      positionHint: "manual only",
      riskReward: 3.6,
      status: "actionable",
      targets: ["R1", "R2"],
    },
    strategyV3: strategyV3WithTradePlan(),
  }));

  assert.equal(ready.stage, "TRADE_PLAN_READY");
  assert.equal(ready.canEnterMainSignalArea, true);
  assert.equal(ready.canAttachTradePlan, true);
  assert.equal(ready.canRequestAiReview, true);
  assert.ok(ready.reasons.includes("eligible_v3_trade_plan"));
});

test("classifySignalMaturity does not promote v3 plans that are eligible but not ready", () => {
  const waiting = classifySignalMaturity(signal({
    state: "near_trigger",
    strategy: {
      bias: "long",
      entry: "retest",
      invalidation: "range lost",
      positionHint: "manual only",
      riskReward: 3.6,
      status: "actionable",
      targets: ["R1", "R2"],
    },
    strategyV3: strategyV3WithTradePlan({
      status: "WAIT_PULLBACK",
      summary: "等待回踩确认",
    }),
  }));

  assert.equal(waiting.stage, "EVIDENCE_SIGNAL");
  assert.equal(waiting.canAttachTradePlan, false);
  assert.ok(waiting.reasons.includes("trade_plan_not_ready"));
});

test("applySignalMaturity recalculates stale persisted maturity", () => {
  const recalculated = applySignalMaturity(signal({
    maturity: {
      canAttachTradePlan: true,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "交易计划就绪",
      reasons: ["eligible_v3_trade_plan"],
      stage: "TRADE_PLAN_READY",
    },
    strategyV3: strategyV3WithTradePlan({
      status: "WAIT_PULLBACK",
      summary: "等待回踩确认",
    }),
  }));

  assert.equal(recalculated.maturity?.stage, "EVIDENCE_SIGNAL");
  assert.equal(recalculated.maturity?.canAttachTradePlan, false);
});

test("classifySignalMaturity does not promote trade plans blocked by timeframe gate", () => {
  const gated = classifySignalMaturity(signal({
    state: "near_trigger",
    strategy: {
      bias: "long",
      entry: "retest",
      invalidation: "range lost",
      positionHint: "manual only",
      riskReward: 3.6,
      status: "actionable",
      targets: ["R1", "R2"],
    },
    timeframeGate: {
      action: "WAIT_HIGH_TIMEFRAME_BREAK",
      allowed: false,
      blockedBy: ["structure_timeframe_conflict"],
      conflictTimeframes: ["1h"],
      guardrail: "低周期不能推翻高周期。",
      mode: "multi_timeframe_hard_gate_v1",
      summary: "1h/4h 结构未确认，只能等待高周期突破。",
    },
    strategyV3: strategyV3WithTradePlan(),
  }));

  assert.equal(gated.stage, "EVIDENCE_SIGNAL");
  assert.equal(gated.canAttachTradePlan, false);
  assert.ok(gated.reasons.includes("timeframe_gate_blocked"));
});

test("buildSignalMaturityDiagnostics exposes counts and main-signal symbols", () => {
  const diagnostics = buildSignalMaturityDiagnostics({
    lightScanMarkCount: 12,
    signals: [
      applySignalMaturity(signal({
        id: "candidate",
        evidence: [],
        state: "insufficient_data",
        symbol: "COLDUSDT",
      })),
      applySignalMaturity(signal({ id: "evidence", symbol: "TIAUSDT" })),
      applySignalMaturity(signal({
        id: "ready",
        state: "near_trigger",
        strategy: {
          bias: "long",
          entry: "retest",
          invalidation: "lost",
          positionHint: "manual",
          riskReward: 3.4,
          status: "actionable",
          targets: ["R1"],
        },
        strategyV3: strategyV3WithTradePlan(),
        symbol: "SUIUSDT",
      })),
    ],
  });

  assert.equal(diagnostics.counts.LIGHT_SCAN_MARK, 12);
  assert.equal(diagnostics.counts.DEEP_SCAN_CANDIDATE, 1);
  assert.equal(diagnostics.counts.EVIDENCE_SIGNAL, 1);
  assert.equal(diagnostics.counts.TRADE_PLAN_READY, 1);
  assert.deepEqual(diagnostics.mainSignalSymbols, ["TIAUSDT", "SUIUSDT"]);
  assert.deepEqual(diagnostics.candidateLaneSymbols, ["COLDUSDT"]);
  assert.match(diagnostics.guardrail, /轻扫标记不进入主信号区/u);
});
