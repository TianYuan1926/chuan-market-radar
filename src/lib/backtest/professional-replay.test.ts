import assert from "node:assert/strict";
import test from "node:test";
import type { Candle } from "../market/ohlcv/types";
import {
  buildReplayCandlesByTimeframe,
  runProfessionalReplay,
} from "./professional-replay";

function candle(index: number, close: number, volume = 100): Candle {
  const time = Date.UTC(2026, 0, 1, 0, index * 15);

  return {
    close,
    closeTime: new Date(time + 15 * 60_000 - 1).toISOString(),
    high: close * 1.01,
    low: close * 0.99,
    open: close * 0.998,
    openTime: new Date(time).toISOString(),
    volume,
  };
}

function series(count: number, start: number, step: number) {
  return Array.from({ length: count }, (_, index) =>
    candle(index, start + index * step, 100 + index)
  );
}

test("buildReplayCandlesByTimeframe derives 1h/4h/1d from 15m history", () => {
  const candles = series(192, 1, 0.001);
  const frames = buildReplayCandlesByTimeframe(candles);

  assert.equal(frames["15m"]?.length, 192);
  assert.equal(frames["1h"]?.length, 48);
  assert.equal(frames["4h"]?.length, 12);
  assert.equal(frames["1d"]?.length, 2);
});

test("runProfessionalReplay produces professional v2 report with findings and remediations", () => {
  const report = runProfessionalReplay({
    baseInterval: "15m",
    candlesBySymbol: new Map([
      ["AAAUSDT", series(230, 1, 0.001)],
      ["BBBUSDT", series(230, 2, -0.001)],
      ["CCCUSDT", series(230, 1.5, 0.0005)],
    ]),
    generatedAt: "2026-01-03T00:00:00.000Z",
    options: {
      horizonBars: 24,
      maxCasesInReport: 12,
      stepBars: 12,
      topN: 2,
    },
  });

  assert.equal(report.schemaVersion, "professional-backtest-audit-report.v2");
  assert.ok(report.cases.length > 0);
  assert.ok(report.input.replayTimes > 0);
  assert.ok(report.roundSummary.cases > 0);
  assert.ok(report.findings.some((item) => item.id.startsWith("PBA-")));
  assert.ok(report.remediationPlan.length > 0);
});
