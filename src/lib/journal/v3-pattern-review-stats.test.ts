import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildV3PatternReviewStats } from "./v3-pattern-review-stats";

function event({
  id,
  lessons,
  outcomeStatus = "pending",
  result = "watching",
}: {
  id: string;
  lessons?: string[];
  outcomeStatus?: SignalOutcomeStatus;
  result?: JournalEvent["result"];
}): JournalEvent {
  return {
    id,
    signalId: `${id}-signal`,
    symbol: `${id.toUpperCase()}USDT`,
    title: "v3 复盘样本",
    result,
    note: "只读复盘样本。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000Z",
    lessons,
    outcomeStatus,
    reviewStatus: outcomeStatus === "pending" ? "tracking" : "closed",
  };
}

test("buildV3PatternReviewStats groups readonly v3 pattern and trade-plan tags", () => {
  const report = buildV3PatternReviewStats([
    event({
      id: "double-bottom-win",
      lessons: ["still_tracking", "v3_trade_READY_LONG", "v3_pattern_context", "v3_pattern_DOUBLE_BOTTOM"],
      outcomeStatus: "partial_win",
      result: "win",
    }),
    event({
      id: "double-bottom-saved",
      lessons: ["still_tracking", "v3_trade_WAIT_PULLBACK", "v3_pattern_context", "v3_pattern_DOUBLE_BOTTOM"],
      outcomeStatus: "saved",
      result: "saved",
    }),
    event({
      id: "double-bottom-loss",
      lessons: ["still_tracking", "v3_trade_READY_LONG", "v3_pattern_context", "v3_pattern_DOUBLE_BOTTOM"],
      outcomeStatus: "loss",
      result: "loss",
    }),
    event({
      id: "double-top-pending",
      lessons: ["still_tracking", "v3_trade_WATCH_ONLY", "v3_pattern_context", "v3_pattern_DOUBLE_TOP"],
    }),
    event({
      id: "untagged-win",
      lessons: ["confirmed_breakout"],
      outcomeStatus: "partial_win",
      result: "win",
    }),
  ]);

  assert.equal(report.mode, "v3_pattern_trade_review_stats_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.sampleCount, 4);
  assert.equal(report.closedSamples, 3);
  assert.equal(report.pendingSamples, 1);
  assert.equal(report.patternBuckets.length, 2);
  assert.equal(report.tradePlanBuckets.length, 3);
  assert.equal(report.topPattern?.tag, "DOUBLE_BOTTOM");

  const doubleBottom = report.patternBuckets.find((bucket) => bucket.tag === "DOUBLE_BOTTOM");
  assert.equal(doubleBottom?.sampleCount, 3);
  assert.equal(doubleBottom?.validatedSamples, 2);
  assert.equal(doubleBottom?.rejectedSamples, 1);
  assert.equal(doubleBottom?.validationRatePercent, 67);
  assert.equal(doubleBottom?.status, "collecting");

  const readyLong = report.tradePlanBuckets.find((bucket) => bucket.tag === "READY_LONG");
  assert.equal(readyLong?.sampleCount, 2);
  assert.equal(readyLong?.validatedSamples, 1);
  assert.equal(readyLong?.rejectedSamples, 1);

  assert.doesNotMatch(report.patternBuckets.map((bucket) => bucket.tag).join(","), /context/iu);
  assert.match(report.guardrail, /不能自动改权重/);
  assert.match(report.nextStep, /继续收集/);
});

test("buildV3PatternReviewStats stays empty when no v3 review tags exist", () => {
  const report = buildV3PatternReviewStats([
    event({
      id: "plain-win",
      lessons: ["confirmed_breakout"],
      outcomeStatus: "partial_win",
      result: "win",
    }),
  ]);

  assert.equal(report.status, "empty");
  assert.equal(report.sampleCount, 0);
  assert.equal(report.patternBuckets.length, 0);
  assert.equal(report.tradePlanBuckets.length, 0);
  assert.equal(report.topPattern, null);
  assert.equal(report.canAutoAdjustWeights, false);
});
