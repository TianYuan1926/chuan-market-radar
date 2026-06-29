import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal, SignalMaturityStage } from "../analysis/types";
import { buildShadowLiveSignalTrackerReport } from "./shadow-live-signal-tracker";

function signal(stage: SignalMaturityStage, overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    confidence: 62,
    direction: "long",
    evidence: [],
    exchange: "BINANCE",
    id: `${stage.toLowerCase()}-tia`,
    maturity: {
      canAttachTradePlan: stage === "TRADE_PLAN_READY",
      canEnterMainSignalArea: stage !== "LIGHT_SCAN_MARK",
      canRequestAiReview: false,
      label: stage,
      reasons: ["has_structured_evidence"],
      stage,
    },
    regime: "mixed",
    risk: "medium",
    state: "waiting_confirmation",
    strategy: {
      bias: "long",
      entry: "等待突破 1.20 后回踩不破",
      invalidation: "跌回 1.08 下方",
      positionHint: "纸面跟踪，不自动交易",
      riskReward: 3.2,
      status: stage === "TRADE_PLAN_READY" ? "waiting" : "observe_only",
      targets: ["1.56", "1.72"],
    },
    summary: "测试影子实盘候选。",
    symbol: "TIAUSDT",
    timeframe: "15m",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

test("shadow live tracker skips light scan marks and writes only tracking events", () => {
  const report = buildShadowLiveSignalTrackerReport({
    now: new Date("2026-06-29T01:00:00.000Z"),
    signals: [
      signal("LIGHT_SCAN_MARK"),
      signal("DEEP_SCAN_CANDIDATE", { id: "deep-arb", symbol: "ARBUSDT" }),
      signal("EVIDENCE_SIGNAL", { id: "evidence-sui", symbol: "SUIUSDT" }),
    ],
  });

  assert.equal(report.trackedCandidates, 2);
  assert.equal(report.skippedLightScanMarks, 1);
  assert.equal(report.canPromoteSignals, false);
  assert.equal(report.canAutoAdjustWeights, false);
  assert.deepEqual(report.entries.map((entry) => entry.symbol), ["SUIUSDT", "ARBUSDT"]);
  for (const entry of report.entries) {
    assert.equal(entry.action, "trend_radar_review");
    assert.equal(entry.result, "watching");
    assert.equal(entry.outcomeStatus, "pending");
    assert.equal(entry.source, "trend_radar_review_executor");
    assert.ok(entry.lessons?.includes("no_auto_trade"));
    assert.notEqual(entry.signalMaturityStage, "TRADE_PLAN_READY");
  }
});

test("shadow live tracker ranks trade plan ready first but keeps it paper-only", () => {
  const report = buildShadowLiveSignalTrackerReport({
    now: new Date("2026-06-29T01:00:00.000Z"),
    signals: [
      signal("EVIDENCE_SIGNAL", { confidence: 90, id: "evidence-hype", symbol: "HYPEUSDT" }),
      signal("TRADE_PLAN_READY", { confidence: 50, id: "ready-ena", symbol: "ENAUSDT" }),
    ],
  });

  assert.equal(report.planReadyCandidates, 1);
  assert.equal(report.entries[0]?.symbol, "ENAUSDT");
  assert.equal(report.entries[0]?.signalMaturityStage, "TRADE_PLAN_READY");
  assert.equal(report.entries[0]?.allowedUse, "research_only");
  assert.equal(report.entries[0]?.canAutoAdjustWeights, false);
});
