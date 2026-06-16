import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildStrategyWeightCalibrationReport } from "./strategy-weight-calibration";

function calibrationReview({
  id,
  outcomeStatus = "pending",
  result,
  tag,
}: {
  id: string;
  outcomeStatus?: SignalOutcomeStatus;
  result?: JournalEvent["result"];
  tag: string;
}): JournalEvent {
  return {
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: tag,
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T10:00:00.000Z",
    id,
    note: "规则校准复盘样本。",
    outcomeStatus,
    rankDelta: 0,
    result: result ?? (outcomeStatus === "loss" ? "loss" : outcomeStatus === "saved" ? "saved" : "watching"),
    reviewStatus: outcomeStatus === "pending" ? "tracking" : "closed",
    source: "daily_mover_calibration",
    symbol: `${tag.slice(7, 10).toUpperCase()}USDT`,
    title: "规则校准复盘",
  };
}

function strategyConfirmation({
  id,
  tag,
  versionLabel,
}: {
  id: string;
  tag: string;
  versionLabel: string;
}): JournalEvent {
  return {
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: tag,
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id,
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: `strategy-${tag}`,
    strategyTag: tag,
    strategyVersionLabel: versionLabel,
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  };
}

test("buildStrategyWeightCalibrationReport summarizes manual weight backtest candidates without auto weights", () => {
  const report = buildStrategyWeightCalibrationReport([
    ...Array.from({ length: 5 }, (_, index) => calibrationReview({
      id: `volume-win-${index}`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
      tag: "review_volume_oi_weight",
    })),
    calibrationReview({
      id: "volume-loss-0",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_volume_oi_weight",
    }),
    strategyConfirmation({
      id: "confirm-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-oi-weight-v1",
    }),
    calibrationReview({
      id: "short-loss-0",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_short_side_detection",
    }),
    calibrationReview({
      id: "short-loss-1",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_short_side_detection",
    }),
    calibrationReview({
      id: "short-win-0",
      outcomeStatus: "partial_win",
      result: "win",
      tag: "review_short_side_detection",
    }),
    ...Array.from({ length: 3 }, (_, index) => calibrationReview({
      id: `universe-loss-${index}`,
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_universe_coverage",
    })),
    calibrationReview({
      id: "funding-pending",
      outcomeStatus: "pending",
      tag: "review_funding_pressure",
    }),
  ]);

  assert.equal(report.mode, "strategy_weight_backtest_calibration_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.status, "blocked");
  assert.equal(report.sampleCount, 13);
  assert.equal(report.closedSamples, 12);
  assert.equal(report.increaseCandidates, 1);
  assert.equal(report.decreaseCandidates, 1);
  assert.equal(report.quarantineCandidates, 1);
  assert.equal(report.pendingCandidates, 1);
  assert.match(report.guardrail, /不自动写入/);

  const [quarantine, decrease, increase, hold] = report.candidates;

  assert.equal(quarantine?.tag, "review_universe_coverage");
  assert.equal(quarantine?.recommendation, "quarantine_candidate");
  assert.equal(quarantine?.manualAdjustmentBand, "quarantine");
  assert.equal(quarantine?.canAutoAdjustWeights, false);

  assert.equal(decrease?.tag, "review_short_side_detection");
  assert.equal(decrease?.recommendation, "decrease_candidate");
  assert.equal(decrease?.rejectionRatePercent, 67);

  assert.equal(increase?.tag, "review_volume_oi_weight");
  assert.equal(increase?.recommendation, "increase_candidate");
  assert.equal(increase?.validationRatePercent, 83);
  assert.equal(increase?.confirmedVersions, 1);
  assert.equal(increase?.latestVersionLabel, "draft-volume-oi-weight-v1");
  assert.match(increase?.nextStep ?? "", /人工复核/);

  assert.equal(hold?.tag, "review_funding_pressure");
  assert.equal(hold?.recommendation, "hold_observation");
  assert.equal(hold?.pendingSamples, 1);
});
