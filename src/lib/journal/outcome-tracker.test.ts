import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, MarketSignal } from "@/lib/analysis/types";
import type { Candle } from "@/lib/market/ohlcv/types";
import { rankJournalEvent } from "./rank-engine";
import {
  buildLifecycleJournalEvent,
  buildReviewSchedule,
  deriveRuleAdjustment,
  evaluateSignalOutcome,
} from "./outcome-tracker";

const baseSignal: MarketSignal = {
  id: "ena-breakout-plan",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 78,
  risk: "low",
  updatedAt: "2026-06-12T10:00:00.000Z",
  summary: "突破前压缩，等待触发，不提前追。",
  evidence: [
    {
      label: "structure",
      value: "range compression",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "trigger 10.00",
    invalidation: "stop 9.40",
    targets: ["target 11.20"],
    riskReward: 3.5,
    status: "actionable",
    positionHint: "Only act after trigger confirmation.",
    confirmation: ["confirmed_breakout"],
    counterEvidence: ["chase_without_trigger"],
  },
};

function candle(
  openTime: string,
  high: number,
  low: number,
  close = high,
): Candle {
  return {
    openTime,
    open: close,
    high,
    low,
    close,
    volume: 1000,
    closeTime: openTime,
  };
}

test("buildReviewSchedule uses timeframe-specific validation windows", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const oneHourSchedule = buildReviewSchedule({
    ...baseSignal,
    timeframe: "1h",
  }, "2026-06-12T10:00:00.000Z");
  const fourHourSchedule = buildReviewSchedule({
    ...baseSignal,
    timeframe: "4h",
  }, "2026-06-12T10:00:00.000Z");

  assert.deepEqual(schedule.map((checkpoint) => checkpoint.id), ["1h", "4h"]);
  assert.deepEqual(schedule.map((checkpoint) => checkpoint.reviewAt), [
    "2026-06-12T11:00:00.000Z",
    "2026-06-12T14:00:00.000Z",
  ]);
  assert.deepEqual(schedule.map((checkpoint) => checkpoint.status), [
    "pending",
    "pending",
  ]);
  assert.deepEqual(oneHourSchedule.map((checkpoint) => checkpoint.id), ["4h", "24h"]);
  assert.deepEqual(oneHourSchedule.map((checkpoint) => checkpoint.reviewAt), [
    "2026-06-12T14:00:00.000Z",
    "2026-06-13T10:00:00.000Z",
  ]);
  assert.deepEqual(fourHourSchedule.map((checkpoint) => checkpoint.id), ["24h", "4d"]);
  assert.deepEqual(fourHourSchedule.map((checkpoint) => checkpoint.reviewAt), [
    "2026-06-13T10:00:00.000Z",
    "2026-06-16T10:00:00.000Z",
  ]);
});

test("evaluateSignalOutcome records a partial win when first target arrives before invalidation", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const outcome = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 10.1, 9.8, 10.05),
    candle("2026-06-12T11:05:00.000Z", 11.3, 10.2, 11.1),
    candle("2026-06-12T12:00:00.000Z", 10.8, 9.2, 9.5),
  ], schedule);

  assert.equal(outcome.status, "partial_win");
  assert.equal(outcome.result, "win");
  assert.equal(outcome.triggerHit, true);
  assert.equal(outcome.firstTargetHit, true);
  assert.equal(outcome.invalidationHit, false);
  assert.equal(outcome.rankDelta, 2);
  assert.deepEqual(outcome.outcomeMetrics, {
    entryPrice: 10,
    evaluatedCandles: 2,
    firstTargetPrice: 11.2,
    invalidationPrice: 9.4,
    maePercent: 2,
    maxAdversePrice: 9.8,
    maxFavorablePrice: 11.3,
    mfePercent: 13,
    validationWindowHours: 4,
    validationWindowLabel: "4h",
  });
  assert.deepEqual(outcome.lessonTags, ["confirmed_breakout", "target_before_invalidation"]);
});

test("evaluateSignalOutcome counts invalidation before trigger as a saved setup", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const outcome = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 9.8, 9.25, 9.5),
    candle("2026-06-12T10:30:00.000Z", 9.9, 9.3, 9.7),
  ], schedule);

  assert.equal(outcome.status, "saved");
  assert.equal(outcome.result, "saved");
  assert.equal(outcome.triggerHit, false);
  assert.equal(outcome.invalidationHit, true);
  assert.equal(outcome.rankDelta, 2);
  assert.deepEqual(outcome.lessonTags, ["waited_for_trigger", "invalidation_before_entry"]);
});

test("evaluateSignalOutcome records a loss when invalidation arrives after trigger and before target", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const outcome = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 10.15, 9.8, 10.05),
    candle("2026-06-12T10:45:00.000Z", 10.2, 9.2, 9.35),
  ], schedule);

  assert.equal(outcome.status, "loss");
  assert.equal(outcome.result, "loss");
  assert.equal(outcome.triggerHit, true);
  assert.equal(outcome.firstTargetHit, false);
  assert.equal(outcome.invalidationHit, true);
  assert.equal(outcome.rankDelta, -1);
  assert.deepEqual(outcome.lessonTags, ["triggered_then_invalidated"]);
});

test("buildLifecycleJournalEvent closes an expired signal without rank reward", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const outcome = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 9.95, 9.55, 9.7),
    candle("2026-06-13T10:05:00.000Z", 9.9, 9.6, 9.8),
  ], schedule);
  const event = buildLifecycleJournalEvent(baseSignal, outcome);

  assert.equal(outcome.status, "expired");
  assert.equal(event.result, "watching");
  assert.equal(event.reviewStatus, "closed");
  assert.equal(event.rankDelta, 0);
  assert.equal(event.outcomeStatus, "expired");
  assert.equal(event.triggerHit, false);
  assert.equal(event.invalidationHit, false);
  assert.equal(event.outcomeMetrics?.validationWindowHours, 4);
  assert.equal(event.outcomeMetrics?.validationWindowLabel, "4h");
  assert.equal(event.reviewCheckpoints?.at(-1)?.status, "complete");
});

test("buildLifecycleJournalEvent persists signal maturity and outcome metrics for research-only statistics", () => {
  const matureSignal: MarketSignal = {
    ...baseSignal,
    maturity: {
      canAttachTradePlan: false,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "证据融合信号",
      reasons: ["has_structured_evidence", "trade_plan_not_ready"],
      stage: "EVIDENCE_SIGNAL",
    },
  };
  const schedule = buildReviewSchedule(matureSignal, "2026-06-12T10:00:00.000Z");
  const outcome = evaluateSignalOutcome(matureSignal, [
    candle("2026-06-12T10:15:00.000Z", 10.1, 9.8, 10.05),
    candle("2026-06-12T11:05:00.000Z", 11.3, 10.2, 11.1),
  ], schedule);
  const event = buildLifecycleJournalEvent(matureSignal, outcome);

  assert.equal(event.signalMaturityStage, "EVIDENCE_SIGNAL");
  assert.equal(event.outcomeMetrics?.mfePercent, 13);
  assert.equal(event.outcomeMetrics?.maePercent, 2);
});

test("rankJournalEvent rewards disciplined saved decisions more than blind wins", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const savedOutcome = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 9.8, 9.25, 9.5),
  ], schedule);
  const savedEvent = buildLifecycleJournalEvent(baseSignal, savedOutcome);
  const blindWin: JournalEvent = {
    id: "blind-win",
    symbol: "ENAUSDT",
    title: "Blind win",
    result: "win",
    note: "No lifecycle proof.",
    rankDelta: 0,
    createdAt: "2026-06-12T10:30:00.000Z",
    reviewStatus: "closed",
  };

  assert.ok(rankJournalEvent(savedEvent) > rankJournalEvent(blindWin));
});

test("deriveRuleAdjustment promotes repeated validated tags and demotes repeated failures", () => {
  const schedule = buildReviewSchedule(baseSignal, "2026-06-12T10:00:00.000Z");
  const good = evaluateSignalOutcome(baseSignal, [
    candle("2026-06-12T10:15:00.000Z", 10.1, 9.8, 10.05),
    candle("2026-06-12T11:05:00.000Z", 11.3, 10.2, 11.1),
  ], schedule);
  const bad = evaluateSignalOutcome({
    ...baseSignal,
    id: "late-confirmation",
    strategy: {
      ...baseSignal.strategy,
      confirmation: ["late_confirmation"],
    },
  }, [
    candle("2026-06-12T10:15:00.000Z", 10.15, 9.8, 10.05),
    candle("2026-06-12T10:45:00.000Z", 10.2, 9.2, 9.35),
  ], schedule);

  const adjustment = deriveRuleAdjustment([good, { ...good, signalId: "ena-second" }, bad, { ...bad, signalId: "late-second" }]);

  assert.deepEqual(adjustment.promote, ["confirmed_breakout", "target_before_invalidation"]);
  assert.deepEqual(adjustment.demote, ["late_confirmation", "triggered_then_invalidated"]);
  assert.deepEqual(adjustment.experiment, []);
});
