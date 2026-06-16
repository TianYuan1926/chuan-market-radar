import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildOutcomeCalibrationFlow } from "./outcome-calibration-flow";

function outcomeEvent({
  id,
  outcomeStatus,
  result = "watching",
}: {
  id: string;
  outcomeStatus: SignalOutcomeStatus;
  result?: JournalEvent["result"];
}): JournalEvent {
  return {
    createdAt: "2026-06-12T10:00:00.000Z",
    id,
    note: "自动复盘样本。",
    outcomeStatus,
    rankDelta: 0,
    result,
    reviewStatus: outcomeStatus === "pending" ? "tracking" : "closed",
    signalId: `${id}-signal`,
    symbol: `${id.toUpperCase()}USDT`,
    title: "生命周期复盘",
  };
}

function calibrationReview({
  id,
  createdAt,
  outcomeStatus = "pending",
  tag = "review_volume_oi_weight",
}: {
  id: string;
  createdAt: string;
  outcomeStatus?: SignalOutcomeStatus;
  tag?: string;
}): JournalEvent {
  return {
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: tag,
    canAutoAdjustWeights: false,
    createdAt,
    id,
    note: "规则校准复盘样本。",
    outcomeStatus,
    rankDelta: 0,
    result: outcomeStatus === "loss" ? "loss" : outcomeStatus === "saved" ? "saved" : "watching",
    reviewStatus: outcomeStatus === "pending" ? "tracking" : "closed",
    source: "daily_mover_calibration",
    symbol: "SUIUSDT",
    title: "规则校准复盘",
  };
}

function strategyConfirmation(): JournalEvent {
  return {
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id: "strategy-confirmation",
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  };
}

test("buildOutcomeCalibrationFlow connects admission, manual confirmation, and rollback watch as read-only", () => {
  const outcomeSamples = [
    ...Array.from({ length: 8 }, (_, index) => outcomeEvent({
      id: `validated-${index}`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    })),
    ...Array.from({ length: 4 }, (_, index) => outcomeEvent({
      id: `counter-${index}`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    })),
  ];
  const flow = buildOutcomeCalibrationFlow([
    ...outcomeSamples,
    calibrationReview({ id: "pre-confirmation-review", createdAt: "2026-06-12T10:30:00.000Z" }),
    strategyConfirmation(),
    calibrationReview({ id: "post-loss-1", createdAt: "2026-06-12T12:00:00.000Z", outcomeStatus: "loss" }),
    calibrationReview({ id: "post-loss-2", createdAt: "2026-06-12T13:00:00.000Z", outcomeStatus: "loss" }),
    calibrationReview({ id: "post-loss-3", createdAt: "2026-06-12T14:00:00.000Z", outcomeStatus: "loss" }),
  ]);

  assert.equal(flow.mode, "outcome_calibration_readonly_flow");
  assert.equal(flow.allowedUse, "research_only");
  assert.equal(flow.canAutoAdjustWeights, false);
  assert.equal(flow.autoWeightEligible, false);
  assert.equal(flow.status, "rollback_watch");
  assert.equal(flow.admissionStatus, "ready");
  assert.equal(flow.sampleGateReady, true);
  assert.equal(flow.calibrationReviewEvents, 4);
  assert.equal(flow.pendingCalibrationReviews, 1);
  assert.equal(flow.manualConfirmationEvents, 1);
  assert.equal(flow.rollbackWatchVersions, 1);
  assert.match(flow.nextStep, /回滚观察/);
  assert.match(flow.guardrail, /不能自动改权重/);
  assert.deepEqual(flow.checkpoints.map((checkpoint) => checkpoint.id), [
    "sample_admission",
    "manual_confirmation",
    "rollback_boundary",
  ]);
  assert.equal(flow.checkpoints[0]?.status, "complete");
  assert.equal(flow.checkpoints[1]?.status, "complete");
  assert.equal(flow.checkpoints[2]?.status, "watch");
});
