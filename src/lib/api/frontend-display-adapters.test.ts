import assert from "node:assert/strict";
import test from "node:test";
import { resource } from "../data-status";
import {
  leaderboardRowsToTokens,
  mergeTokensBySymbol,
  leaderboardRowsToCandidateSignals,
  radarSignalsToSignalCards,
  radarSignalsToSniperTargets,
  radarSignalsToTokens,
  withLeaderboardSignalFallback,
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

function signalReads(
  maturity: RadarSignal["maturity"],
  overrides: Partial<RadarSignal["operatorRead"]> = {},
): Pick<RadarSignal, "lifecycle" | "operatorRead"> {
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
      laneLabel: maturity === "TRADE_PLAN_READY" ? "狙击榜" : "重点观察",
      nextAction: "测试下一步",
      noTradeReason: maturity === "TRADE_PLAN_READY" ? null : "测试中未生成交易计划",
      worthWatching: true,
      ...overrides,
    },
  };
}

test("leaderboard rows become visible candidate signals without trade plans", () => {
  const signals = leaderboardRowsToCandidateSignals(rows, "gainers");

  assert.equal(signals.length, 2);
  assert.deepEqual(
    signals.map((signal) => signal.maturity),
    ["REVIEW_ONLY", "DEEP_SCAN_CANDIDATE"],
  );
  assert.ok(signals.every((signal) => signal.rr === null));
  assert.ok(signals.every((signal) => /不能当作交易计划|不允许追涨追跌/u.test(signal.whyBlocked ?? "")));
});

test("empty mature signals still render candidate cards and tokens", () => {
  const cards = radarSignalsToSignalCards([], rows);
  const tokens = radarSignalsToTokens([], rows);

  assert.equal(cards.length, 2);
  assert.equal(tokens.length, 2);
  assert.deepEqual(
    new Set(cards.map((card) => card.token.symbol)),
    new Set(["MET", "AIO"]),
  );
  assert.ok(cards.every((card) => card.category !== "sniper"));
  assert.ok(cards.every((card) => card.odds === 0));
  assert.ok(cards.every((card) => card.sourceKind === "leaderboard_candidate"));
  assert.ok(cards.every((card) => card.maturity === "DEEP_SCAN_CANDIDATE"));
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
});

test("sniper targets do not fabricate frontend entry stop or target prices", () => {
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
  assert.equal(target?.entryLow, 0);
  assert.equal(target?.entryHigh, 0);
  assert.equal(target?.stop, 0);
  assert.equal(target?.target1, 0);
  assert.equal(target?.target2, 0);
  assert.match(target?.outcomeNote ?? "", /后端完整交易计划/);
});

test("signal resource fallback keeps real signals and appends missing candidates", () => {
  const realSignal: RadarSignal = {
    id: "real-met",
    symbol: "MET",
    hue: 130,
    direction: "多",
    maturity: "EVIDENCE_SIGNAL",
    rr: 2.8,
    risk: "中",
    evidenceCount: 4,
    counterCount: 1,
    freshness: "live",
    whySelected: "真实证据融合信号",
    whyBlocked: null,
    updatedMinAgo: 1,
    ...signalReads("EVIDENCE_SIGNAL"),
  };

  const merged = withLeaderboardSignalFallback(
    resource([realSignal], "live", { source: "signal-worker" }),
    rows,
  );

  assert.equal(merged.data.length, 2);
  assert.equal(merged.data[0], realSignal);
  assert.equal(merged.data[1].symbol, "AIO");
  assert.match(merged.source ?? "", /leaderboard/);
});
