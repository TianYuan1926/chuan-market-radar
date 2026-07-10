import assert from "node:assert/strict";
import test from "node:test";
import { resource } from "../data-status";
import {
  dashboardRuntimeStatusLabelFromContracts,
  leaderboardRowsToTokens,
  mergeTokensBySymbol,
  radarSignalsToSignalCards,
  radarSignalsToSniperTargets,
  radarSignalsToTokens,
  scanProofResourceToDataQuality,
} from "../frontend-display-adapters";
import type { LeaderboardRow, RadarSignal } from "../radar-contract";

const rows: LeaderboardRow[] = [
  {
    symbol: "MET",
    hue: 130,
    value: 21.87,
    price: 0.1789,
    inCandidatePool: true,
    deepScanned: false,
    hasSignal: false,
    blocked: false,
    awaitingScan: true,
  },
  {
    symbol: "AIO",
    hue: 250,
    value: -13.5,
    price: 0.10997,
    inCandidatePool: true,
    deepScanned: true,
    hasSignal: false,
    blocked: false,
    awaitingScan: false,
  },
];

test("dashboard runtime status only reflects production runtime resources", () => {
  assert.equal(
    dashboardRuntimeStatusLabelFromContracts({
      statuses: ["live", "live", "live"],
      sourceFeeds: ["live", "live", "live", "live"],
    }),
    "正常",
  );
  assert.equal(
    dashboardRuntimeStatusLabelFromContracts({
      statuses: ["live", "partial", "live"],
      sourceFeeds: ["live", "live"],
    }),
    "降级",
  );
  assert.equal(
    dashboardRuntimeStatusLabelFromContracts({
      statuses: ["live", "live"],
      sourceFeeds: ["live", "failed"],
    }),
    "异常",
  );
});

test("data quality never turns unavailable scan facts into zero or a confidence score", () => {
  const quality = scanProofResourceToDataQuality(resource({
    observedAssets: 0,
    acceptedAssets: 0,
    eligibleAssets: 0,
    currentCycleScannedAssets: 0,
    deepScanned: 0,
    awaitingDeepScan: 0,
    lightCoveragePercent: 0,
    deepCoveragePercent: 0,
    lightCoverageDenominator: "eligible_assets",
    deepCoverageDenominator: "eligible_assets",
    lastScanAt: "n/a",
    nextScanCountdownSec: 0,
    stuck: true,
  }, "empty"));

  assert.equal(quality.observed, null);
  assert.equal(quality.accepted, null);
  assert.equal(quality.eligible, null);
  assert.equal(quality.currentCycleScanned, null);
  assert.equal(quality.deepScanned, null);
  assert.equal(quality.delayMs, null);
  assert.equal(quality.evidenceStatus, "不可用");
  assert.equal("trust" in quality, false);
});

function signalReads(
  maturity: RadarSignal["maturity"],
  overrides: Partial<RadarSignal["operatorRead"]> = {},
  unifiedOverrides: Partial<RadarSignal["unifiedDecision"]> = {},
): Pick<RadarSignal, "lifecycle" | "operatorRead" | "unifiedDecision"> {
  const readyPlan: NonNullable<RadarSignal["unifiedDecision"]["readyPlan"]> = {
    direction: "long",
    plannedEntryPrice: 7.8,
    rewardRisk: 3.4,
    structuralStop: 7.2,
    targets: [8.6, 9.1],
  };
  const canTradeNow = maturity === "TRADE_PLAN_READY";

  return {
    lifecycle: {
      ageLabel: "1分钟前",
      ageMin: 1,
      firstSeenAt: "2026-06-25T00:00:00.000Z",
      freshnessLabel: "刚出现",
      lastUpdatedAt: "2026-06-25T00:00:00.000Z",
      source: "current_signal_timestamp",
      status: "new",
      summary: "测试信号生命周期",
    },
    operatorRead: {
      canTrade: maturity === "TRADE_PLAN_READY",
      headline: maturity === "TRADE_PLAN_READY" ? "交易计划就绪" : "已有证据，但还不能直接做",
      lane: maturity === "TRADE_PLAN_READY" ? "sniper" : "watch",
      laneLabel: maturity === "TRADE_PLAN_READY" ? "计划就绪区" : "重点观察",
      nextAction: "测试下一步",
      noTradeReason: maturity === "TRADE_PLAN_READY" ? null : "测试中未生成交易计划",
      worthWatching: true,
      ...overrides,
    },
    unifiedDecision: {
      schemaVersion: "signal-unified-decision.v1",
      source: "unified_decision_engine",
      decision: maturity === "TRADE_PLAN_READY" ? "TRADE_PLAN_READY" : maturity === "BLOCKED" ? "BLOCKED" : "WAIT",
      decisionLabel: maturity === "TRADE_PLAN_READY" ? "交易计划就绪" : maturity === "BLOCKED" ? "拦截" : "等待",
      allowedUse: "backend_decision_only",
      canAutoExecute: false,
      canCreateTradePlanFromRegime: false,
      canMutateLiveRanking: false,
      canTradeNow,
      reasons: [canTradeNow ? "测试后端 readyPlan 已通过" : "测试中未生成交易计划"],
      blockerReasons: [],
      blockerCount: 0,
      waitPlanReady: false,
      readyPlan: canTradeNow ? readyPlan : null,
      ...unifiedOverrides,
    },
  };
}

test("leaderboard rows never become signals, signal cards, or signal tokens", () => {
  const cards = radarSignalsToSignalCards([], rows);
  const tokens = radarSignalsToTokens([], rows);

  assert.deepEqual(cards, []);
  assert.deepEqual(tokens, []);
});

test("leaderboard tokens use real row price and never metric value as price", () => {
  const tokens = leaderboardRowsToTokens([
    {
      symbol: "BTC",
      hue: 35,
      value: 61_000_000_000,
      price: 67_443.2,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: false,
      blocked: false,
      awaitingScan: false,
    },
  ], "volume");

  assert.equal(tokens[0]?.symbol, "BTC");
  assert.equal(tokens[0]?.price, 67_443.2);
  assert.equal(tokens[0]?.volume24h, 61_000_000_000);
});

test("leaderboard tokens do not fabricate prices when backend price is missing", () => {
  const tokens = leaderboardRowsToTokens([
    {
      symbol: "BTC",
      hue: 35,
      value: 6.2,
      price: 0,
      inCandidatePool: true,
      deepScanned: false,
      hasSignal: false,
      blocked: false,
      awaitingScan: true,
    },
  ], "gainers");

  assert.equal(tokens[0]?.price, 0);
  assert.equal(tokens[0]?.change24h, 6.2);
});

test("leaderboard tokens do not fabricate unsupported period changes", () => {
  const tokens = leaderboardRowsToTokens([
    {
      symbol: "TIA",
      hue: 220,
      value: 9.25,
      price: 7.842,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: false,
      blocked: false,
      awaitingScan: false,
    },
  ], "gainers");

  assert.equal(tokens[0]?.change24h, 9.25);
  assert.equal(tokens[0]?.change1h, 0);
  assert.equal(tokens[0]?.change7d, 0);
  assert.equal(tokens[0]?.change30d, 0);
});

test("merged tokens preserve real price and real change from different leaderboards", () => {
  const gainers = leaderboardRowsToTokens([
    {
      symbol: "ETH",
      hue: 210,
      value: 4.5,
      price: 0,
      inCandidatePool: false,
      deepScanned: false,
      hasSignal: false,
      blocked: false,
      awaitingScan: true,
    },
  ], "gainers");
  const volume = leaderboardRowsToTokens([
    {
      symbol: "ETH",
      hue: 210,
      value: 28_000_000_000,
      price: 3_612.5,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: false,
      blocked: false,
      awaitingScan: false,
    },
  ], "volume");

  const [merged] = mergeTokensBySymbol(gainers, volume);

  assert.equal(merged?.price, 3_612.5);
  assert.equal(merged?.volume24h, 28_000_000_000);
  assert.equal(merged?.change24h, 4.5);
});

test("leaderboard fallback does not create sniper targets", () => {
  const targets = radarSignalsToSniperTargets([], rows);

  assert.equal(targets.length, 0);
});

test("signal cards keep push price empty until backend lifecycle tracking provides it", () => {
  const signal: RadarSignal = {
    id: "real-tia",
    symbol: "TIA",
    hue: 220,
    direction: "多",
    maturity: "EVIDENCE_SIGNAL",
    rr: 3.1,
    risk: "低",
    evidenceCount: 5,
    counterCount: 0,
    score: 84,
    freshness: "live",
    whySelected: "真实证据融合信号",
    whyBlocked: null,
    updatedMinAgo: 1,
    ...signalReads("EVIDENCE_SIGNAL"),
  };

  const cards = radarSignalsToSignalCards([signal], [
    {
      symbol: "TIA",
      hue: 220,
      value: 12.4,
      price: 7.842,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: true,
      blocked: false,
      awaitingScan: false,
    },
  ]);

  assert.equal(cards[0]?.pushPrice, 0);
  assert.equal(cards[0]?.score, 84);
  assert.equal(cards[0]?.bullSentiment, null);
  assert.equal(cards[0]?.volMult, null);
});

test("sniper targets stay empty when unified decision has no ready plan", () => {
  const signal: RadarSignal = {
    id: "real-tia",
    symbol: "TIA",
    hue: 220,
    direction: "多",
    maturity: "TRADE_PLAN_READY",
    rr: 3.4,
    risk: "低",
    evidenceCount: 6,
    counterCount: 0,
    score: 91,
    freshness: "live",
    whySelected: "后端证据融合已通过",
    whyBlocked: null,
    updatedMinAgo: 1,
    ...signalReads("TRADE_PLAN_READY", {}, {
      canTradeNow: false,
      readyPlan: null,
      decision: "BLOCKED",
      decisionLabel: "拦截",
      reasons: ["测试：缺少统一 readyPlan"],
    }),
  };

  const targets = radarSignalsToSniperTargets([signal], [
    {
      symbol: "TIA",
      hue: 220,
      value: 12.4,
      price: 7.842,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: true,
      blocked: false,
      awaitingScan: false,
    },
  ]);

  assert.equal(targets.length, 0);
});

test("sniper targets use only backend unified ready plan levels", () => {
  const signal: RadarSignal = {
    id: "real-tia",
    symbol: "TIA",
    hue: 220,
    direction: "多",
    maturity: "TRADE_PLAN_READY",
    rr: 3.4,
    risk: "低",
    evidenceCount: 6,
    counterCount: 0,
    score: 91,
    freshness: "live",
    whySelected: "后端证据融合已通过",
    whyBlocked: null,
    updatedMinAgo: 1,
    ...signalReads("TRADE_PLAN_READY"),
  };

  const [target] = radarSignalsToSniperTargets([signal], [
    {
      symbol: "TIA",
      hue: 220,
      value: 12.4,
      price: 7.842,
      inCandidatePool: true,
      deepScanned: true,
      hasSignal: true,
      blocked: false,
      awaitingScan: false,
    },
  ]);

  assert.equal(target?.pushPrice, 0);
  assert.equal(target?.entryLow, 7.8);
  assert.equal(target?.entryHigh, 7.8);
  assert.equal(target?.stop, 7.2);
  assert.equal(target?.target1, 8.6);
  assert.equal(target?.target2, 9.1);
  assert.match(target?.outcomeNote ?? "", /后端完整交易计划/);
});
