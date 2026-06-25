import assert from "node:assert/strict";
import test from "node:test";
import type { Candle } from "../market/ohlcv/types";
import {
  buildReplayDerivativesInput,
  buildReplayCandlesByTimeframe,
  runProfessionalReplay,
  type ProfessionalDerivativePoint,
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

function derivativePoint(index: number, fundingRate: number, openInterestUsd: number): ProfessionalDerivativePoint {
  const time = Date.UTC(2026, 0, 1, 0, index * 15);

  return {
    fundingRate,
    observedAt: new Date(time).toISOString(),
    openInterestUsd,
    source: "public_exchange",
  };
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

test("buildReplayDerivativesInput uses only historical funding and open interest", () => {
  const observedAt = new Date(Date.UTC(2026, 0, 2, 0, 0)).toISOString();
  const input = buildReplayDerivativesInput([
    derivativePoint(0, 0.0001, 100_000_000),
    derivativePoint(16, 0.00012, 101_000_000),
    derivativePoint(32, 0.00011, 102_000_000),
    derivativePoint(48, 0.00013, 103_000_000),
    derivativePoint(96, 0.0002, 110_000_000),
    derivativePoint(120, 0.01, 900_000_000),
  ], observedAt);

  assert.equal(input.status, "live");
  assert.equal(input.source, "public_exchange");
  assert.equal(input.openInterestChangePercent, 10);
  assert.notEqual(input.fundingRateZScore, undefined);
  assert.ok(Math.abs(input.fundingRateZScore ?? 0) < 10, "future funding spike must not leak into z-score");
});

test("runProfessionalReplay clears derivatives finding when historical derivatives are available", () => {
  const report = runProfessionalReplay({
    baseInterval: "15m",
    candlesBySymbol: new Map([
      ["AAAUSDT", series(230, 1, 0.001)],
      ["BBBUSDT", series(230, 2, -0.001)],
      ["CCCUSDT", series(230, 1.5, 0.0005)],
    ]),
    derivativesBySymbol: new Map([
      ["AAAUSDT", Array.from({ length: 230 }, (_, index) => derivativePoint(index, 0.0001 + index * 0.000001, 100_000_000 + index * 100_000))],
      ["BBBUSDT", Array.from({ length: 230 }, (_, index) => derivativePoint(index, 0.00008 + index * 0.000001, 90_000_000 + index * 80_000))],
      ["CCCUSDT", Array.from({ length: 230 }, (_, index) => derivativePoint(index, 0.00005 + index * 0.000001, 80_000_000 + index * 60_000))],
    ]),
    generatedAt: "2026-01-03T00:00:00.000Z",
    options: {
      horizonBars: 24,
      maxCasesInReport: 12,
      stepBars: 12,
      topN: 2,
    },
  });

  assert.equal(report.input.derivativesSymbolsUsed, 3);
  assert.equal(report.cases.some((item) => item.findings.some((finding) => finding.id === "PBA-DERIVATIVES-001")), false);
});
