import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistoricalBacktestMarkdown,
  buildHistoricalFeature,
  evaluateHistoricalOutcome,
  runHistoricalReplay,
} from "./radar-historical-backtest-core.mjs";

function iso(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, index * 15)).toISOString();
}

function candle(index, price, volume = 100) {
  return {
    close: price,
    closeTime: iso(index),
    high: price * 1.003,
    low: price * 0.997,
    open: price,
    openTime: iso(index),
    volume,
  };
}

function buildPremoveCandles() {
  const candles = [];

  for (let index = 0; index < 220; index += 1) {
    let price = 10 + Math.sin(index / 9) * 0.08;
    let volume = 100;

    if (index >= 154 && index <= 160) {
      volume = 420;
      price += (index - 154) * 0.01;
    }

    if (index > 160) {
      price = 10.1 + Math.min(index - 160, 24) * 0.07;
      volume = 260;
    }

    candles.push(candle(index, price, volume));
  }

  return candles;
}

function buildLateMoveCandles() {
  const candles = [];

  for (let index = 0; index < 220; index += 1) {
    let price = 10;
    let volume = 120;

    if (index > 80 && index <= 160) {
      price = 10 + (index - 80) * 0.055;
      volume = 250;
    } else if (index > 160) {
      price = 14.4 + Math.sin(index / 4) * 0.08;
      volume = 180;
    }

    candles.push(candle(index, price, volume));
  }

  return candles;
}

function buildFlatCandles() {
  return Array.from({ length: 220 }, (_, index) => candle(index, 8 + Math.sin(index / 6) * 0.04, 90));
}

test("historical feature scoring favors pre-move compression over already-extended moves", () => {
  const preMove = buildHistoricalFeature("ALPHAUSDT", buildPremoveCandles(), 160, {
    minHistoryBars: 96,
  });
  const lateMove = buildHistoricalFeature("LATEUSDT", buildLateMoveCandles(), 160, {
    minHistoryBars: 96,
  });

  assert.ok(preMove, "pre-move feature should exist");
  assert.ok(lateMove, "late-move feature should exist");
  assert.ok(preMove.opportunityScore > lateMove.opportunityScore, `${preMove.opportunityScore} should beat ${lateMove.opportunityScore}`);
  assert.ok(lateMove.overextensionRisk > preMove.overextensionRisk);
});

test("outcome evaluation measures future MFE and late-at-selection without using it in feature scoring", () => {
  const candles = buildPremoveCandles();
  const feature = buildHistoricalFeature("ALPHAUSDT", candles, 160, {
    minHistoryBars: 96,
  });
  const outcome = evaluateHistoricalOutcome(candles, 160, feature, {
    horizonBars: 48,
    moveThresholdPct: 10,
  });

  assert.equal(outcome.hit, true);
  assert.equal(outcome.lateAtSelection, false);
  assert.ok(outcome.mfePct >= 10);
});

test("historical replay returns lane baselines and findings without mutating state", () => {
  const result = runHistoricalReplay({
    candlesBySymbol: new Map([
      ["ALPHAUSDT", buildPremoveCandles()],
      ["LATEUSDT", buildLateMoveCandles()],
      ["FLATUSDT", buildFlatCandles()],
    ]),
    options: {
      horizonBars: 32,
      minHistoryBars: 96,
      moveThresholdPct: 8,
      stepBars: 16,
      topN: 2,
    },
  });

  assert.ok(result.replayTimes > 0);
  assert.ok(result.laneMetrics.radar.count > 0);
  assert.ok(result.laneMetrics.momentum.count > 0);
  assert.ok(result.laneMetrics.volume.count > 0);
  assert.ok(result.laneMetrics.random.count > 0);
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.diagnostics.radarScoreBuckets.length > 0);
  assert.ok(Array.isArray(result.diagnostics.radarReasonMetrics));
  assert.ok(Array.isArray(result.diagnostics.missedOpportunities));
  assert.deepEqual(result.symbolsUsed.sort(), ["ALPHAUSDT", "FLATUSDT", "LATEUSDT"]);
});

test("historical markdown states research-only and no future-leak boundaries", () => {
  const result = runHistoricalReplay({
    candlesBySymbol: new Map([
      ["ALPHAUSDT", buildPremoveCandles()],
      ["LATEUSDT", buildLateMoveCandles()],
      ["FLATUSDT", buildFlatCandles()],
    ]),
    options: {
      horizonBars: 32,
      minHistoryBars: 96,
      moveThresholdPct: 8,
      stepBars: 16,
      topN: 2,
    },
  });
  const markdown = buildHistoricalBacktestMarkdown(result, {
    days: 7,
    interval: "15m",
    source: "synthetic-test",
  });

  assert.match(markdown, /历史时间点回放/);
  assert.match(markdown, /禁止偷看未来/);
  assert.match(markdown, /不是自动下单/);
});
