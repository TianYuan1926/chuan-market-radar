import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "../analysis/types";
import { buildReviewStatisticsReport } from "./review-statistics";

function event(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: overrides.id ?? "review-1",
    symbol: overrides.symbol ?? "TIAUSDT",
    title: overrides.title ?? "TIA review",
    result: overrides.result ?? "watching",
    note: overrides.note ?? "review sample",
    rankDelta: overrides.rankDelta ?? 0,
    createdAt: overrides.createdAt ?? "2026-06-21T08:00:00.000Z",
    ...overrides,
  };
}

test("buildReviewStatisticsReport keeps review evolution research-only", () => {
  const report = buildReviewStatisticsReport([
    event({
      id: "win",
      outcomeMetrics: {
        entryPrice: 10,
        evaluatedCandles: 12,
        firstTargetPrice: 13,
        invalidationPrice: 9,
        maePercent: -1.2,
        mfePercent: 8.5,
        validationWindowHours: 24,
        validationWindowLabel: "24h",
      },
      outcomeStatus: "partial_win",
      reviewStatus: "closed",
      signalMaturityStage: "TRADE_PLAN_READY",
    }),
    event({
      id: "loss",
      outcomeMetrics: {
        entryPrice: 10,
        evaluatedCandles: 4,
        firstTargetPrice: 13,
        invalidationPrice: 9,
        maePercent: -4.1,
        mfePercent: 1.5,
        validationWindowHours: 24,
        validationWindowLabel: "24h",
      },
      outcomeStatus: "loss",
      reviewStatus: "closed",
      signalMaturityStage: "EVIDENCE_SIGNAL",
      symbol: "WIFUSDT",
    }),
    event({
      id: "pending",
      outcomeStatus: "pending",
      reviewStatus: "tracking",
      signalMaturityStage: "DEEP_SCAN_CANDIDATE",
      symbol: "SUIUSDT",
    }),
  ], new Date("2026-06-21T09:00:00.000Z"));

  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canMutateLiveRanking, false);
  assert.equal(report.samples.total, 3);
  assert.equal(report.samples.closed, 2);
  assert.equal(report.samples.pending, 1);
  assert.equal(report.samples.evidenceLevel, 2);
  assert.equal(report.samples.tradePlanReady, 1);
  assert.equal(report.winRate.expiredExcludedPercent, 50);
  assert.equal(report.mfe.averagePercent, 5);
  assert.equal(report.mae.maxPercent, 0);
  assert.match(report.guardrail, /不能自动改权重/);
});

test("buildReviewStatisticsReport reports empty samples without pretending readiness", () => {
  const report = buildReviewStatisticsReport([], new Date("2026-06-21T09:00:00.000Z"));

  assert.equal(report.sampleStatus, "empty");
  assert.equal(report.samples.total, 0);
  assert.equal(report.samples.withMetrics, 0);
  assert.equal(report.mfe.averagePercent, null);
  assert.equal(report.mae.averagePercent, null);
  assert.equal(report.mfe.maxPercent, null);
  assert.equal(report.mae.maxPercent, null);
  assert.equal(report.winRate.expiredExcludedPercent, null);
  assert.match(report.summary, /还没有可统计/);
});

test("buildReviewStatisticsReport does not mark non-evidence samples usable", () => {
  const samples = Array.from({ length: 40 }, (_, index) => event({
    id: `closed-${index}`,
    outcomeStatus: index % 2 === 0 ? "saved" : "loss",
    reviewStatus: "closed",
    signalMaturityStage: "DEEP_SCAN_CANDIDATE",
    symbol: `ALT${index}USDT`,
  }));
  const report = buildReviewStatisticsReport(samples, new Date("2026-06-21T09:00:00.000Z"));

  assert.equal(report.samples.closed, 40);
  assert.equal(report.samples.evidenceLevel, 0);
  assert.equal(report.sampleStatus, "collecting");
  assert.match(report.summary, /证据级样本 0 条/);
});

test("buildReviewStatisticsReport does not count a metrics envelope with missing MFE or MAE", () => {
  const report = buildReviewStatisticsReport([
    event({
      id: "missing-metrics",
      outcomeMetrics: {
        evaluatedCandles: 0,
        validationWindowHours: 24,
        validationWindowLabel: "24h",
      },
      outcomeStatus: "pending",
      reviewStatus: "tracking",
    }),
  ], new Date("2026-06-21T09:00:00.000Z"));

  assert.equal(report.samples.withMetrics, 0);
  assert.equal(report.mfe.averagePercent, null);
  assert.equal(report.mae.averagePercent, null);
});
