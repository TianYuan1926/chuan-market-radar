import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRadarSnapshot } from "../market/types";
import {
  buildShadowCandidateObservations,
  evaluateCurrentShadowCaptureRuntimeGate,
  evaluateShadowCaptureRuntimeGate,
} from "./shadow-capture-runtime";

const control = {
  phase: "shadow_capture",
  epoch: 1,
  deadlineAt: "2026-07-15T00:00:00.000Z",
  writeFrozen: false,
  approvedReleaseId: "release-1",
};

test("current release is code-authorized only when every runtime boundary is ready", () => {
  const decision = evaluateCurrentShadowCaptureRuntimeGate({
    killSwitchRequested: true,
    repositoryMode: "database",
    scope: "production_radar",
    expectedReleaseId: "release-1",
    now: "2026-07-12T00:00:00.000Z",
    control,
  });
  assert.equal(decision.enabled, true);
  assert.deepEqual(decision.blockers, []);
});

test("future authorized composition still fails closed on every runtime boundary", () => {
  const ready = evaluateShadowCaptureRuntimeGate({
    killSwitchRequested: true,
    codeActivationAllowed: true,
    repositoryMode: "database",
    scope: "production_radar",
    expectedReleaseId: "release-1",
    now: "2026-07-12T00:00:00.000Z",
    control,
  });
  assert.equal(ready.enabled, true);

  const blocked = evaluateShadowCaptureRuntimeGate({
    killSwitchRequested: false,
    codeActivationAllowed: true,
    repositoryMode: "memory",
    scope: "preview",
    expectedReleaseId: "release-2",
    now: "2026-07-16T00:00:00.000Z",
    control: { ...control, phase: "legacy", epoch: 0, writeFrozen: true },
  });
  assert.equal(blocked.enabled, false);
  assert.deepEqual(blocked.blockers, [
    "kill_switch_off",
    "database_repository_required",
    "production_scope_required",
    "migration_phase_inactive",
    "migration_epoch_invalid",
    "migration_deadline_expired",
    "migration_write_frozen",
    "release_mismatch",
  ]);
});

function snapshot(): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-1",
      mode: "scheduled",
      status: "ready",
      source: "composite",
      isRealtime: true,
      cadenceMinutes: 5,
      scannedCount: 2,
      anomalyCount: 2,
      candidateCount: 2,
      riskGate: "on",
      generatedAt: "2026-07-12T00:00:00.000Z",
      nextScanAt: "2026-07-12T00:05:00.000Z",
      staleAfterMinutes: 15,
      notes: [],
      lightScan: {
        acceptedCount: 2,
        candidateCount: 2,
        generatedAt: "2026-07-12T00:00:00.000Z",
        notes: [],
        requestCount: 2,
        source: "binance",
        status: "ready",
        topCandidates: [{
          baseAsset: "BTC",
          changePercent24h: 4,
          distanceFromHighPercent: 2,
          distanceFromLowPercent: 12,
          price: 100000,
          reasons: ["volume expansion"],
          score: 82,
          state: "HOT",
          symbol: "BTCUSDT",
          volume24hUsd: 1_000_000,
          volatilityPercent: 4,
        }, {
          baseAsset: "MISSING",
          changePercent24h: 3,
          distanceFromHighPercent: 1,
          distanceFromLowPercent: 10,
          reasons: ["unresolved"],
          score: 61,
          state: "WARM",
          symbol: "MISSINGUSDT",
          volume24hUsd: 500_000,
          volatilityPercent: 3,
        }],
        universeCount: 2,
      },
    },
    instrumentPool: { instruments: [], rejected: [], summary: {
      total: 1, accepted: 1, rejected: 0, duplicatesRemoved: 0,
      minVolume24hUsd: 0, quoteAssets: ["USDT"], marketTypes: ["perpetual"],
    } },
    instruments: [{
      id: "BINANCE:BTCUSDT:PERPETUAL",
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd: 1_000_000,
      tags: [],
      lastSeenAt: "2026-07-12T00:00:00.000Z",
    }],
    tickers: [{
      symbol: "BTCUSDT",
      exchange: "BINANCE",
      price: 100000,
      changePercent24h: 4,
      volume24hUsd: 1_000_000,
      high24h: 102000,
      low24h: 90000,
      updatedAt: "2026-07-12T00:00:00.000Z",
    }],
    derivatives: [],
    heatmap: [],
    signals: [{
      id: "signal-btc",
      symbol: "BTCUSDT",
      exchange: "BINANCE",
      direction: "long",
      state: "waiting_confirmation",
      timeframe: "15m",
      regime: "risk_on",
      confidence: 86,
      risk: "medium",
      updatedAt: "2026-07-12T00:00:00.000Z",
      summary: "candidate",
      evidence: [],
      strategy: {
        bias: "long", entry: "waiting", invalidation: "structure",
        targets: [], riskReward: 0, positionHint: "none",
      },
      maturity: {
        canAttachTradePlan: false,
        canEnterMainSignalArea: false,
        canRequestAiReview: false,
        label: "candidate",
        reasons: ["trade_plan_not_ready"],
        stage: "DEEP_SCAN_CANDIDATE",
      },
    }],
    journalEvents: [],
  };
}

test("candidate mapper uses canonical venue identity and never copies trade direction or plan", () => {
  const result = buildShadowCandidateObservations(snapshot(), "release-1");
  assert.equal(result.complete, false);
  assert.deepEqual(result.rejections, [{
    sourceId: "light:MISSINGUSDT",
    symbol: "MISSINGUSDT",
    reason: "instrument_identity_unresolved",
  }]);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.maturity, "deep_candidate");
  assert.equal(result.observations[0]?.directionState, "unknown");
  assert.deepEqual(result.observations[0]?.discoveryReasons, ["deep_scan_candidate"]);
  assert.equal("strategy" in (result.observations[0] ?? {}), false);
});
