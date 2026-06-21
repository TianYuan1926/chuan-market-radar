import assert from "node:assert/strict";
import test from "node:test";
import { resource } from "../data-status";
import {
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

test("leaderboard rows become visible candidate signals without trade plans", () => {
  const signals = leaderboardRowsToCandidateSignals(rows, "gainers");

  assert.equal(signals.length, 2);
  assert.deepEqual(
    signals.map((signal) => signal.maturity),
    ["DEEP_SCAN_CANDIDATE", "DEEP_SCAN_CANDIDATE"],
  );
  assert.ok(signals.every((signal) => signal.rr === null));
  assert.ok(signals.every((signal) => signal.whyBlocked?.includes("不能当作交易计划")));
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
});

test("leaderboard fallback does not create sniper targets", () => {
  const targets = radarSignalsToSniperTargets([], rows);

  assert.equal(targets.length, 0);
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
