import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRadarSnapshot } from "./types";
import { buildSignalBackendDossier } from "./signal-backend-dossier";

function snapshot(): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-dossier",
      mode: "scheduled",
      status: "ready",
      source: "coinglass",
      isRealtime: true,
      cadenceMinutes: 15,
      scannedCount: 4,
      anomalyCount: 1,
      candidateCount: 1,
      riskGate: "on",
      generatedAt: "2026-06-19T08:00:00.000Z",
      nextScanAt: "2026-06-19T08:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["test scan"],
    },
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 4,
        duplicatesRemoved: 0,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        rejected: 0,
        total: 4,
      },
    },
    instruments: [
      {
        id: "BINANCE:ARBUSDT",
        symbol: "ARBUSDT",
        baseAsset: "ARB",
        quoteAsset: "USDT",
        exchange: "BINANCE",
        marketType: "perpetual",
        isActive: true,
        volume24hUsd: 10_000_000,
        tags: ["coinglass", "Binance", "lev:50"],
        lastSeenAt: "2026-06-19T08:00:00.000Z",
      },
    ],
    journalEvents: [
      {
        id: "journal-arb-track",
        signalId: "arb-signal",
        symbol: "ARBUSDT",
        title: "记录 ARB 观察",
        result: "watching",
        note: "等待突破确认",
        rankDelta: 2,
        createdAt: "2026-06-19T08:03:00.000Z",
        action: "track",
        outcomeStatus: "pending",
      },
    ],
    signals: [
      {
        id: "arb-signal",
        symbol: "ARBUSDT",
        exchange: "BINANCE",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        regime: "risk_on",
        confidence: 82,
        risk: "medium",
        updatedAt: "2026-06-19T08:00:00.000Z",
        summary: "ARB 接近趋势切换",
        evidence: [
          {
            label: "结构压缩",
            layer: "structure_location",
            polarity: "supportive",
            value: "1h range compression",
          },
          {
            label: "Funding 拥挤",
            layer: "derivatives",
            polarity: "conflicting",
            value: "funding elevated",
          },
        ],
        timeframeGate: {
          action: "WAIT_HIGH_TIMEFRAME_BREAK",
          allowed: false,
          blockedBy: ["structure_timeframe_conflict"],
          conflictTimeframes: ["1h"],
          guardrail: "低周期不能推翻高周期。",
          mode: "multi_timeframe_hard_gate_v1",
          summary: "1h 关键压力未突破。",
        },
        strategy: {
          bias: "long",
          entry: "8.20 突破确认",
          invalidation: "跌回 7.76",
          positionHint: "等待确认，不追单",
          riskReward: 3.4,
          targets: ["8.60", "9.15"],
          status: "waiting",
        },
        strategyV3: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          currentPrice: 7.842,
          forwardLevels: [
            {
              id: "arb-r1",
              symbol: "ARBUSDT",
              side: "RESISTANCE",
              role: "NEXT_REACTION_ZONE",
              zoneLow: 8.2,
              zoneHigh: 8.28,
              timeframeWeight: 4,
              keyScore: 84,
              status: "AHEAD",
              reasons: ["前高压力"],
              confirmationRules: ["15m close above 8.28"],
              invalidationRules: ["1h close below 7.76"],
              sourceLevelIds: ["arb-key-r1"],
            },
          ],
          guardrails: ["不自动下单", "不自动改权重"],
          keyLevels: [
            {
              id: "arb-key-s1",
              symbol: "ARBUSDT",
              timeframe: "1h",
              type: "RANGE_LOW",
              zoneLow: 7.76,
              zoneHigh: 7.92,
              midPrice: 7.84,
              direction: "SUPPORT",
              keyScore: 80,
              reactionScore: 62,
              confluenceScore: 70,
              status: "POTENTIAL",
              reasons: ["箱体下沿"],
              confirmationRules: ["缩量回踩守住"],
              invalidationRule: "跌破 7.76",
            },
            {
              id: "arb-key-r1",
              symbol: "ARBUSDT",
              timeframe: "1h",
              type: "RANGE_HIGH",
              zoneLow: 8.2,
              zoneHigh: 8.28,
              midPrice: 8.24,
              direction: "RESISTANCE",
              keyScore: 84,
              reactionScore: 58,
              confluenceScore: 73,
              status: "POTENTIAL",
              reasons: ["箱体上沿"],
              confirmationRules: ["放量突破站稳"],
              invalidationRule: "突破后跌回箱体",
            },
          ],
          primaryTimeframe: "1h",
          source: "existing_ohlcv_key_level_mvp",
          sourceTimeframes: ["15m", "1h", "4h"],
          summary: "v3 关键位地图",
          symbol: "ARBUSDT",
          tradePlan: {
            allowedUse: "research_only",
            blockedBy: [],
            canAutoAdjustWeights: false,
            canMutateLiveRanking: false,
            confirmationChecklist: ["突破 8.28", "回踩不破 8.20"],
            direction: "long",
            entryZone: "8.20 - 8.28",
            hasAutoExecution: false,
            invalidation: "1h 跌回 7.76",
            isPlanEligible: true,
            manualReviewRequired: true,
            positionSizing: "轻仓确认",
            rewardRisk: 3.4,
            status: "READY_LONG",
            structuralStop: 7.76,
            summary: "等待突破确认",
            takeProfitPlan: "分批止盈",
            targets: [8.6, 9.15],
          },
          trendContext: {
            allowedUse: "research_only",
            canAutoAdjustWeights: false,
            canMutateLiveRanking: false,
            conflicts: [],
            decision: "WAIT_LONG_BREAKOUT",
            guardrail: "readonly",
            nextStep: "等待突破确认",
            noParticipationReasons: [],
            riskGate: {
              allowed: true,
              blockedBy: [],
              mode: "readonly_v3_risk_gate",
            },
            scores: {
              exhaustionScore: 20,
              longPreTrendScore: 76,
              longTrendEnergyScore: 68,
              riskScore: 35,
              shortPreTrendScore: 10,
              shortTrendEnergyScore: 8,
              trendHoldScore: 60,
            },
            state: "PRE_TREND_LONG",
            summary: "接近趋势切换",
            timeframes: [
              {
                changePercent: 3.2,
                close: 7.842,
                compressionScore: 72,
                directionalScore: 68,
                rangePercent: 4.4,
                structure: "COMPRESSING",
                timeframe: "1h",
              },
            ],
          },
        },
      },
    ],
    tickers: [],
  };
}

test("buildSignalBackendDossier returns chart context, levels, evidence and readonly guardrails", () => {
  const dossier = buildSignalBackendDossier({
    snapshot: snapshot(),
    symbol: "arb",
  });

  assert.equal(dossier.found, true);
  assert.equal(dossier.symbol, "ARBUSDT");
  assert.equal(dossier.signal?.state, "near_trigger");
  assert.equal(dossier.signal?.timeframeGate?.allowed, false);
  assert.equal(dossier.signal?.timeframeGate?.action, "WAIT_HIGH_TIMEFRAME_BREAK");
  assert.equal(dossier.chart.tradingView.symbol, "BINANCE:ARBUSDT.P");
  assert.equal(
    dossier.chart.tradingView.url,
    "https://www.tradingview.com/chart/?symbol=BINANCE%3AARBUSDT.P&interval=15",
  );
  assert.deepEqual(dossier.chart.availableTimeframes, ["15m", "1h", "4h"]);
  assert.equal(dossier.strategyV3?.keyLevels.length, 2);
  assert.equal(dossier.strategyV3?.forwardLevels.length, 1);
  assert.equal(dossier.strategyV3?.tradePlan?.rewardRisk, 3.4);
  assert.equal(dossier.execution?.maxLeverage, 50);
  assert.equal(dossier.execution?.maxLeverageSource, "coinglass_instrument_tag");
  assert.equal(dossier.evidence.supportiveCount, 1);
  assert.equal(dossier.evidence.conflictingCount, 1);
  assert.equal(dossier.journal.recentEvents.length, 1);
  assert.ok(dossier.guardrails.includes("report_is_translation_only"));
  assert.ok(dossier.guardrails.includes("no_auto_execution"));
});

test("buildSignalBackendDossier reports not found without fabricating chart data", () => {
  const dossier = buildSignalBackendDossier({
    snapshot: snapshot(),
    symbol: "missing",
  });

  assert.equal(dossier.found, false);
  assert.equal(dossier.symbol, "MISSING");
  assert.equal(dossier.signal, null);
  assert.equal(dossier.strategyV3, null);
  assert.equal(dossier.journal.recentEvents.length, 0);
});
