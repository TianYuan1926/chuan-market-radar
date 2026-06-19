import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import {
  buildFallbackScanStatePoolReport,
  buildScanStatePoolReport,
} from "./scan-state-pool";
import {
  buildUniverseRegistry,
  planUniverseScan,
} from "./universe-registry";
import type { ContractInstrument, DerivativeSnapshot, MarketTicker } from "./types";

function instrument(
  baseAsset: string,
  overrides: Partial<ContractInstrument> = {},
): ContractInstrument {
  const symbol = `${baseAsset}USDT`;

  return {
    id: `BINANCE:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 50_000_000,
    tags: [],
    lastSeenAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}

function ticker(symbol: string, changePercent24h: number): MarketTicker {
  return {
    symbol,
    exchange: "BINANCE",
    price: 1,
    changePercent24h,
    volume24hUsd: 80_000_000,
    high24h: 1.1,
    low24h: 0.9,
    updatedAt: "2026-06-19T00:00:00.000Z",
  };
}

function derivative(symbol: string, openInterestChangePercent: number): DerivativeSnapshot {
  return {
    symbol,
    exchange: "BINANCE",
    source: "coinglass",
    openInterestUsd: 50_000_000,
    openInterestChangePercent,
    fundingRate: 0.0001,
    fundingRateZScore: 0.2,
    updatedAt: "2026-06-19T00:00:00.000Z",
  };
}

function signal(symbol: string, overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: `signal-${symbol}`,
    symbol,
    exchange: "BINANCE",
    direction: "long",
    state: "near_trigger",
    timeframe: "15m",
    regime: "range",
    confidence: 82,
    risk: "medium",
    updatedAt: "2026-06-19T00:00:00.000Z",
    summary: "接近触发",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "等待突破确认",
      invalidation: "跌回箱体",
      positionHint: "轻仓观察",
      riskReward: 3.4,
      targets: ["前高"],
      status: "waiting",
    },
    ...overrides,
  };
}

test("buildScanStatePoolReport keeps the whole universe in state pools instead of hard-filtering assets", () => {
  const registry = buildUniverseRegistry(
    ["SOL"],
    [
      instrument("ARB", { volume24hUsd: 85_000_000 }),
      instrument("OP", { volume24hUsd: 70_000_000 }),
      instrument("MANTA", { volume24hUsd: 0 }),
      instrument("PEPE", { volume24hUsd: 0 }),
    ],
  );
  const batchPlan = planUniverseScan(registry, 4, new Date("2026-06-19T00:00:00.000Z"), {
    dynamicPrioritySlots: 1,
    priorityHints: [
      {
        symbol: "ARBUSDT",
        anomalyScore: 92,
        recentSignalCount: 3,
      },
      {
        symbol: "OPUSDT",
        historicalSampleSize: 18,
        historicalWinRate: 0.64,
        recentSignalCount: 2,
      },
    ],
  });

  const report = buildScanStatePoolReport({
    batchPlan,
    derivatives: [
      derivative("ARBUSDT", 8),
      derivative("SOLUSDT", 2),
    ],
    registry,
    signals: [signal("ARBUSDT")],
    tickers: [
      ticker("BTCUSDT", 0.2),
      ticker("ETHUSDT", -0.1),
      ticker("ARBUSDT", 5.2),
      ticker("SOLUSDT", 0.4),
    ],
  });

  assert.equal(report.mode, "state_pool_mvp");
  assert.equal(report.proof.universeAssets, registry.assets.length);
  assert.equal(report.proof.notEliminatedAssets, registry.assets.length);
  assert.equal(report.counts.BATTLE_READY, 1);
  assert.equal(report.counts.REVIVE_WATCH, 1);
  assert.ok(report.counts.COLD >= 1);
  assert.ok(report.deepScan.selectedAssets.includes("ARB"));
  assert.ok(report.deepScan.queuedAssets.includes("OP"));
  assert.match(report.guardrail, /不能永久删除/);
  assert.match(report.proof.notes.join(" "), /前置层不是硬漏斗/);
});

test("buildFallbackScanStatePoolReport creates a degraded proof from coverage without adding requests", () => {
  const report = buildFallbackScanStatePoolReport({
    batchIndex: 0,
    coveragePercent: 50,
    eligible: 4,
    nextBatchIndex: 1,
    pending: 2,
    pendingAssets: ["SOL", "ARB"],
    scanned: 2,
    scannedAssets: ["BTC", "ETH"],
    skipped: 0,
    skippedAssets: [],
    total: 4,
    totalBatches: 2,
  });

  assert.equal(report.counts.DEEP_QUEUE, 2);
  assert.equal(report.counts.COLD, 2);
  assert.deepEqual(report.deepScan.selectedAssets, ["BTC", "ETH"]);
  assert.deepEqual(report.deepScan.queuedAssets, ["SOL", "ARB"]);
  assert.match(report.deepScan.guardrail, /不增加请求/);
});

test("buildScanStatePoolReport exposes a read-only v2/v3 promotion bridge without mutating ranking", () => {
  const registry = buildUniverseRegistry(
    ["TIA"],
    [instrument("TIA", { volume24hUsd: 120_000_000 })],
  );
  const batchPlan = planUniverseScan(registry, 3, new Date("2026-06-19T00:00:00.000Z"));
  const strategyV2 = {
    canMutateLiveRanking: false,
    counterEvidenceIds: [],
    decision: "WAIT_BREAKOUT",
    ignoredExternalInputs: 0,
    report: {},
    riskGate: { allowed: true, blockedBy: [] },
    scores: { energy: 71, energyDecay: 22, preMove: 76, risk: 28, trendHold: 58 },
    stage: "PRE_BREAKOUT",
    supportEvidenceIds: ["TIAUSDT:15m:breakout_close_above_range:0"],
  } as unknown as NonNullable<MarketSignal["strategyV2"]>;
  const strategyV3 = {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 7.84,
    forwardLevels: [],
    guardrails: [],
    keyLevels: [],
    primaryTimeframe: "1h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h"],
    summary: "预趋势等待突破。",
    symbol: "TIAUSDT",
    tradePlan: {
      allowedUse: "research_only",
      blockedBy: [],
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      confirmationChecklist: ["放量收上箱体"],
      direction: "long",
      entryZone: "等待突破确认",
      hasAutoExecution: false,
      invalidation: "跌回箱体",
      isPlanEligible: false,
      manualReviewRequired: true,
      positionSizing: "轻仓",
      rewardRisk: 3.4,
      status: "WATCH_ONLY",
      structuralStop: 7.32,
      summary: "等待突破确认。",
      takeProfitPlan: "分批止盈",
      targets: [8.21],
    },
    trendContext: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      conflicts: [],
      decision: "WAIT_LONG_BREAKOUT",
      guardrail: "只读。",
      nextStep: "等待突破确认。",
      noParticipationReasons: [],
      riskGate: { allowed: true, blockedBy: [], mode: "readonly_v3_risk_gate" },
      scores: {
        exhaustionScore: 12,
        longPreTrendScore: 77,
        longTrendEnergyScore: 68,
        riskScore: 24,
        shortPreTrendScore: 19,
        shortTrendEnergyScore: 11,
        trendHoldScore: 52,
      },
      state: "PRE_TREND_LONG",
      summary: "多头预趋势。",
      timeframes: [],
    },
  } as NonNullable<MarketSignal["strategyV3"]>;

  const report = buildScanStatePoolReport({
    batchPlan,
    registry,
    signals: [signal("TIAUSDT", { strategyV2, strategyV3 })],
    tickers: [ticker("TIAUSDT", 2.1)],
  });
  const bridge = report.promotionBridge.samples[0];

  assert.equal(bridge?.symbol, "TIAUSDT");
  assert.equal(bridge.canMutateLiveRanking, false);
  assert.equal(bridge.allowedUse, "scan_explanation_only");
  assert.equal(bridge.currentState, "BATTLE_READY");
  assert.equal(bridge.suggestedState, "BATTLE_WATCH");
  assert.equal(bridge.v2?.stage, "PRE_BREAKOUT");
  assert.equal(bridge.v3?.decision, "WAIT_LONG_BREAKOUT");
  assert.match(report.promotionBridge.guardrail, /不改实时排序/);
  assert.equal(report.promotionBridge.summary.readonlySignals, 1);
});

test("buildScanStatePoolReport sends poor reward-risk v2/v3 bridge samples to cooldown explanation", () => {
  const registry = buildUniverseRegistry(
    ["ARB"],
    [instrument("ARB", { volume24hUsd: 110_000_000 })],
  );
  const batchPlan = planUniverseScan(registry, 3, new Date("2026-06-19T00:00:00.000Z"));
  const strategyV2 = {
    canMutateLiveRanking: false,
    counterEvidenceIds: [],
    decision: "AVOID_CHASE",
    ignoredExternalInputs: 0,
    report: {},
    riskGate: { allowed: false, blockedBy: ["reward_risk_below_minimum"] },
    scores: { energy: 81, energyDecay: 45, preMove: 61, risk: 63, trendHold: 58 },
    stage: "EXHAUSTION_RISK",
    supportEvidenceIds: [],
  } as unknown as NonNullable<MarketSignal["strategyV2"]>;

  const report = buildScanStatePoolReport({
    batchPlan,
    registry,
    signals: [
      signal("ARBUSDT", {
        risk: "high",
        strategy: {
          bias: "long",
          entry: "不追",
          invalidation: "跌回箱体",
          noChase: true,
          positionHint: "等待回踩",
          riskReward: 2.1,
          status: "blocked",
          targets: ["前高"],
        },
        strategyV2,
      }),
    ],
    tickers: [ticker("ARBUSDT", 8.1)],
  });
  const bridge = report.promotionBridge.samples[0];

  assert.equal(bridge?.suggestedState, "COOLDOWN");
  assert.match(bridge.summary, /进入冷却/);
  assert.ok(bridge.blockers.some((blocker) => /赔率不足|reward risk below minimum/u.test(blocker)));
  assert.equal(report.promotionBridge.summary.rewardRiskBlocked, 1);
  assert.equal(report.promotionBridge.summary.blockedByRisk, 1);
});
