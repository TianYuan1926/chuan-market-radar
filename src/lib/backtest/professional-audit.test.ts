import assert from "node:assert/strict";
import test from "node:test";
import type { Candle } from "@/lib/market/ohlcv/types";
import {
  buildProfessionalBacktestAuditCase,
  evaluateProfessionalOutcome,
  summarizeProfessionalBacktestRound,
} from "./professional-audit";
import type { MarketSignal } from "@/lib/analysis/types";

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

function series(count: number, start = 1, step = 0.002): Candle[] {
  return Array.from({ length: count }, (_, index) =>
    candle(index, start + index * step, 100 + index)
  );
}

function rangeSeries(count: number, closeFor: (index: number) => number): Candle[] {
  return Array.from({ length: count }, (_, index) =>
    candle(index, closeFor(index), 100 + Math.sin(index / 6) * 8)
  );
}

test("professional audit case reuses production signal, v2 dossier, maturity, and remediation", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(140, 1, 0.001),
      "1h": series(80, 0.95, 0.002),
      "4h": series(60, 0.9, 0.003),
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "TESTUSDT",
  });

  assert.equal(caseResult.schemaVersion, "professional-backtest-audit.v2");
  assert.ok(caseResult.signal.strategyV2, "must include production v2 audit");
  assert.ok(caseResult.signal.strategyV3, "must include production v3 dossier");
  assert.ok(caseResult.signal.maturity, "must classify signal maturity");
  assert.ok(caseResult.capabilities.some((item) => item.layer === "indicator" && item.status === "tested"));
  assert.ok(caseResult.findings.some((item) => item.id === "PBA-DERIVATIVES-001"));
  assert.ok(caseResult.remediationPlan.some((item) => item.layer === "derivatives" && item.canAutoApply === false));
});

test("professional audit marks derivatives as tested only when historical derivatives are supplied", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(140, 1, 0.001),
      "1h": series(80, 0.95, 0.002),
      "4h": series(60, 0.9, 0.003),
    },
    derivatives: {
      fundingRateZScore: 0.2,
      openInterestChangePercent: 6,
      source: "coinglass",
      status: "live",
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "TESTUSDT",
  });

  assert.ok(caseResult.capabilities.some((item) => item.layer === "derivatives" && item.status === "tested"));
  assert.equal(caseResult.findings.some((item) => item.id === "PBA-DERIVATIVES-001"), false);
});

test("professional audit treats partial historical derivatives as partial, not missing", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(140, 1, 0.001),
      "1h": series(80, 0.95, 0.002),
      "4h": series(60, 0.9, 0.003),
    },
    derivatives: {
      fundingRateZScore: 0.4,
      source: "public_exchange",
      status: "partial",
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "PARTIALUSDT",
  });

  assert.ok(caseResult.capabilities.some((item) => item.layer === "derivatives" && item.status === "partial"));
  assert.equal(caseResult.findings.some((item) => item.id === "PBA-DERIVATIVES-001"), false);
});

test("professional audit direction inference treats upper range as resistance, not automatic long chase", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": rangeSeries(140, (index) => index < 100 ? 1 + Math.sin(index / 8) * 0.035 : 1.088 + Math.sin(index / 5) * 0.002),
      "1h": rangeSeries(80, (index) => index < 56 ? 1 + Math.sin(index / 7) * 0.03 : 1.086 + Math.sin(index / 4) * 0.002),
      "4h": rangeSeries(60, (index) => index < 42 ? 1 + Math.sin(index / 6) * 0.026 : 1.084 + Math.sin(index / 4) * 0.002),
    },
    derivatives: {
      status: "partial",
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "RESISTUSDT",
  });

  assert.equal(caseResult.signal.direction, "short");
});

test("professional audit direction inference treats lower range as support, not automatic short chase", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": rangeSeries(140, (index) => index < 100 ? 1 + Math.sin(index / 8) * 0.035 : 0.914 + Math.sin(index / 5) * 0.002),
      "1h": rangeSeries(80, (index) => index < 56 ? 1 + Math.sin(index / 7) * 0.03 : 0.916 + Math.sin(index / 4) * 0.002),
      "4h": rangeSeries(60, (index) => index < 42 ? 1 + Math.sin(index / 6) * 0.026 : 0.918 + Math.sin(index / 4) * 0.002),
    },
    derivatives: {
      status: "partial",
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "SUPPORTUSDT",
  });

  assert.equal(caseResult.signal.direction, "long");
});

test("short outcome uses entry as denominator for MFE and MAE", () => {
  const signalCase = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(140, 2, -0.002),
      "1h": series(80, 2.1, -0.003),
      "4h": series(60, 2.2, -0.004),
    },
    derivatives: {
      status: "live",
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "SHORTUSDT",
  });
  const baseV3 = signalCase.signal.strategyV3;

  assert.ok(baseV3);
  assert.ok(baseV3.tradePlan);

  const signal: MarketSignal = {
    ...signalCase.signal,
    direction: "short" as const,
    strategyV3: {
      ...baseV3,
      currentPrice: 2,
      tradePlan: {
        ...baseV3.tradePlan,
        structuralStop: 2.1,
        targets: [1.7],
      },
    },
  };
  const outcome = evaluateProfessionalOutcome(signal, [
    candle(141, 1.9),
    { ...candle(142, 1.8), low: 1.7, high: 2.04 },
  ], 10);

  assert.equal(outcome?.mfePct, 15);
  assert.equal(outcome?.maePct, 2);
  assert.equal(outcome?.firstEvent, "TP");
});

test("professional audit does not report a blocked non-ready plan as released stop-loss failure", () => {
  const caseResult = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": rangeSeries(140, (index) => index < 100 ? 1 + Math.sin(index / 8) * 0.035 : 0.914 + Math.sin(index / 5) * 0.002),
      "1h": rangeSeries(80, (index) => index < 56 ? 1 + Math.sin(index / 7) * 0.03 : 0.916 + Math.sin(index / 4) * 0.002),
      "4h": rangeSeries(60, (index) => index < 42 ? 1 + Math.sin(index / 6) * 0.026 : 0.918 + Math.sin(index / 4) * 0.002),
    },
    derivatives: {
      status: "partial",
    },
    futureCandles: [
      { ...candle(141, 0.85), low: 0.82, high: 0.93 },
      { ...candle(142, 0.83), low: 0.8, high: 0.9 },
    ],
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "BLOCKEDUSDT",
  });

  assert.notEqual(caseResult.signal.maturity?.stage, "TRADE_PLAN_READY");
  assert.equal(caseResult.outcome?.firstEvent, "SL");
  assert.equal(caseResult.findings.some((item) => item.id === "PBA-REVIEW-001"), false);
  assert.ok(caseResult.findings.some((item) => item.id === "PBA-REVIEW-BLOCKED-001" && item.severity === "low"));
});

test("round summary counts findings and plan-ready samples", () => {
  const first = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(120, 1, 0.001),
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "AUSDT",
  });
  const second = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: {
      "15m": series(120, 1.5, -0.001),
    },
    observedAt: "2026-01-02T00:00:00.000Z",
    symbol: "BUSDT",
  });
  const summary = summarizeProfessionalBacktestRound([first, second]);

  assert.equal(summary.cases, 2);
  assert.ok(summary.findingCounts.derivatives >= 2);
  assert.equal(typeof summary.highSeverityFindings, "number");
});
