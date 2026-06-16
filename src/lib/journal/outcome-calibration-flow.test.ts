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
  symbol = "SUIUSDT",
  tag = "review_volume_oi_weight",
}: {
  id: string;
  createdAt: string;
  outcomeStatus?: SignalOutcomeStatus;
  symbol?: string;
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
    symbol,
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

test("buildOutcomeCalibrationFlow explains blockers and exposes bounded calibration sample drilldown", () => {
  const flow = buildOutcomeCalibrationFlow([
    outcomeEvent({ id: "loss-1", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "loss-2", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "loss-3", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "win-1", outcomeStatus: "partial_win", result: "win" }),
    calibrationReview({
      createdAt: "2026-06-12T12:00:00.000Z",
      id: "calibration-pending",
      symbol: "PENDUSDT",
    }),
    calibrationReview({
      createdAt: "2026-06-12T13:00:00.000Z",
      id: "calibration-saved",
      outcomeStatus: "saved",
      symbol: "SAVEUSDT",
    }),
    calibrationReview({
      createdAt: "2026-06-12T14:00:00.000Z",
      id: "calibration-loss",
      outcomeStatus: "loss",
      symbol: "LOSSUSDT",
    }),
    calibrationReview({
      createdAt: "2026-06-12T15:00:00.000Z",
      id: "calibration-expired",
      outcomeStatus: "expired",
      symbol: "OLDUSDT",
    }),
    calibrationReview({
      createdAt: "2026-06-12T16:00:00.000Z",
      id: "calibration-newest",
      outcomeStatus: "partial_win",
      symbol: "NEWUSDT",
    }),
  ]);

  assert.equal(flow.status, "blocked");
  assert.deepEqual(flow.blockerDetails.map((detail) => detail.code), [
    "closed_samples_below_threshold",
    "counterevidence_dominates",
    "loss_cluster",
    "validation_rate_below_threshold",
  ]);
  assert.match(flow.blockerDetails[1]?.label ?? "", /反证/);
  assert.match(flow.blockerDetails[2]?.nextStep ?? "", /冻结/);
  assert.equal(flow.sampleBreakdown.pending, 1);
  assert.equal(flow.sampleBreakdown.validated, 2);
  assert.equal(flow.sampleBreakdown.rejected, 1);
  assert.equal(flow.sampleBreakdown.expired, 1);
  assert.equal(flow.sampleDrilldown.length, 5);
  assert.deepEqual(flow.sampleDrilldown.map((sample) => sample.symbol), [
    "NEWUSDT",
    "OLDUSDT",
    "LOSSUSDT",
    "SAVEUSDT",
    "PENDUSDT",
  ]);
  assert.deepEqual(flow.sampleDrilldown.map((sample) => sample.bucket), [
    "validated",
    "expired",
    "rejected",
    "validated",
    "pending",
  ]);
  assert.equal(flow.sampleDrilldown[0]?.allowedUse, "research_only");
  assert.equal(flow.sampleDrilldown[0]?.canAutoAdjustWeights, false);
  assert.match(flow.sampleDrilldown[2]?.reason ?? "", /反证/);
});

test("buildOutcomeCalibrationFlow exposes threshold layers and a manual rollback plan", () => {
  const outcomeSamples = [
    ...Array.from({ length: 9 }, (_, index) => outcomeEvent({
      id: `validated-threshold-${index}`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    })),
    ...Array.from({ length: 3 }, (_, index) => outcomeEvent({
      id: `expired-threshold-${index}`,
      outcomeStatus: "expired",
    })),
  ];
  const flow = buildOutcomeCalibrationFlow([
    ...outcomeSamples,
    strategyConfirmation(),
    calibrationReview({
      createdAt: "2026-06-12T12:00:00.000Z",
      id: "confirmed-loss-1",
      outcomeStatus: "loss",
    }),
    calibrationReview({
      createdAt: "2026-06-12T13:00:00.000Z",
      id: "confirmed-loss-2",
      outcomeStatus: "loss",
    }),
    calibrationReview({
      createdAt: "2026-06-12T14:00:00.000Z",
      id: "confirmed-win",
      outcomeStatus: "partial_win",
    }),
  ]);

  assert.equal(flow.status, "rollback_watch");
  assert.deepEqual(flow.thresholdLayers.map((layer) => layer.id), [
    "sample_floor",
    "validation_quality",
    "counterevidence_pressure",
    "manual_confirmation",
    "rollback_pressure",
  ]);
  assert.equal(flow.thresholdLayers[0]?.status, "ready");
  assert.match(flow.thresholdLayers[1]?.target ?? "", /50%/);
  assert.match(flow.thresholdLayers[2]?.detail ?? "", /反证/);
  assert.equal(flow.thresholdLayers[4]?.status, "watch");
  assert.equal(flow.rollbackPlan.mode, "manual_rollback_plan");
  assert.equal(flow.rollbackPlan.allowedUse, "research_only");
  assert.equal(flow.rollbackPlan.canAutoAdjustWeights, false);
  assert.equal(flow.rollbackPlan.stage, "freeze_weight_discussion");
  assert.equal(flow.rollbackPlan.severity, "high");
  assert.match(flow.rollbackPlan.nextStep, /冻结加权讨论/);
  assert.deepEqual(flow.rollbackPlan.checkpoints.map((checkpoint) => checkpoint.id), [
    "confirm_version",
    "observe_followups",
    "freeze_or_retain",
  ]);
});
