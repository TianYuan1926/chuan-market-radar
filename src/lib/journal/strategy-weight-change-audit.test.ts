import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildStrategyWeightCalibrationReport } from "./strategy-weight-calibration";
import { buildStrategyWeightChangeAuditReport } from "./strategy-weight-change-audit";

type AuditCheck = {
  id: string;
  status: string;
};

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

test("buildStrategyWeightChangeAuditReport prepares readonly audit and rollback gates without executing weights", () => {
  const calibrationReport = buildStrategyWeightCalibrationReport([
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
    strategyConfirmation({
      id: "confirm-short",
      tag: "review_short_side_detection",
      versionLabel: "draft-short-side-v1",
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

  const report = buildStrategyWeightChangeAuditReport(calibrationReport);

  assert.equal(report.mode, "strategy_weight_change_audit_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canExecuteWeightChange, false);
  assert.equal(report.status, "blocked");
  assert.equal(report.auditCandidateCount, 3);
  assert.equal(report.readyAuditCount, 1);
  assert.equal(report.rollbackVerificationCount, 1);
  assert.equal(report.blockedAuditCount, 1);
  assert.match(report.guardrail, /不执行真实权重变更/);

  const [quarantine, rollback, ready] = report.items;

  assert.equal(quarantine?.tag, "review_universe_coverage");
  assert.equal(quarantine?.proposedDirection, "quarantine");
  assert.equal(quarantine?.auditStatus, "blocked_by_quarantine");
  assert.equal(quarantine?.canExecuteWeightChange, false);
  assert.match(quarantine?.blockers.join(" ") ?? "", /隔离/);

  assert.equal(rollback?.tag, "review_short_side_detection");
  assert.equal(rollback?.proposedDirection, "decrease");
  assert.equal(rollback?.auditStatus, "rollback_verification_required");
  assert.equal(rollback?.latestVersionLabel, "draft-short-side-v1");
  assert.equal(
    (rollback?.rollbackChecks as AuditCheck[] | undefined)?.find((check) => check.id === "counterevidence_review")?.status,
    "required",
  );

  assert.equal(ready?.tag, "review_volume_oi_weight");
  assert.equal(ready?.proposedDirection, "increase");
  assert.equal(ready?.auditStatus, "ready_for_manual_audit");
  assert.equal(ready?.latestVersionLabel, "draft-volume-oi-weight-v1");
  assert.match(ready?.requiredEvidence.join(" ") ?? "", /人工确认版本/);
  assert.equal(
    (ready?.rollbackChecks as AuditCheck[] | undefined)?.find((check) => check.id === "manual_confirmation")?.status,
    "passed",
  );
});
