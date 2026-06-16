import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildStrategyWeightCalibrationReport } from "./strategy-weight-calibration";
import { buildStrategyWeightChangeAuditReport } from "./strategy-weight-change-audit";
import { buildStrategyWeightChangeExecutionReport } from "./strategy-weight-change-execution";

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

function executionRecord({
  approvalStatus = "approved",
  createdAt = "2026-06-13T09:00:00.000Z",
  id,
  tag,
  versionLabel,
}: {
  approvalStatus?: "approved" | "pending_approval" | "rejected" | "rollback_watch";
  createdAt?: string;
  id: string;
  tag: string;
  versionLabel: string;
}): JournalEvent {
  return {
    action: "strategy_weight_change_execution",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    createdAt,
    id,
    note: "人工权重变更执行记录，只记录审批边界，不写入规则权重。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_weight_change_execution",
    strategyWeightChange: {
      approvalStatus,
      approvedAt: approvalStatus === "approved" ? createdAt : undefined,
      approvedBy: approvalStatus === "approved" ? "chuan" : undefined,
      canExecuteWeightChange: false,
      direction: "increase",
      rollbackTrigger: "如果未来 14 天新增 3 个反证样本，进入人工回滚复核。",
      rollbackWindowDays: 14,
      tag,
      versionLabel,
    },
    symbol: "STRATEGY",
    title: "人工权重变更执行记录",
  };
}

test("buildStrategyWeightChangeExecutionReport records approved manual changes without applying weights", () => {
  const events: JournalEvent[] = [
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
    executionRecord({
      id: "execute-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-oi-weight-v1",
    }),
  ];
  const calibrationReport = buildStrategyWeightCalibrationReport(events);
  const auditReport = buildStrategyWeightChangeAuditReport(calibrationReport);

  const report = buildStrategyWeightChangeExecutionReport(auditReport, events);

  assert.equal(report.mode, "strategy_weight_manual_execution_registry_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canExecuteWeightChange, false);
  assert.equal(report.canWriteRuleWeights, false);
  assert.equal(report.requiresManualApproval, true);
  assert.equal(report.status, "recorded_observation");
  assert.equal(report.executionRecordCount, 1);
  assert.equal(report.approvedRecordCount, 1);
  assert.equal(report.pendingApprovalCount, 0);
  assert.equal(report.rollbackWatchCount, 0);
  assert.match(report.guardrail, /不写入规则权重/);

  const [item] = report.items;

  assert.equal(item?.tag, "review_volume_oi_weight");
  assert.equal(item?.executionStatus, "approved_recorded");
  assert.equal(item?.latestRecordId, "execute-volume");
  assert.equal(item?.latestVersionLabel, "draft-volume-oi-weight-v1");
  assert.equal(item?.approvalBy, "chuan");
  assert.equal(item?.rollbackWindowDays, 14);
  assert.equal(item?.canExecuteWeightChange, false);
  assert.match(item?.rollbackTrigger ?? "", /反证样本/);
});

test("buildStrategyWeightChangeExecutionReport blocks real execution when audit is not clean", () => {
  const events: JournalEvent[] = [
    ...Array.from({ length: 3 }, (_, index) => calibrationReview({
      id: `universe-loss-${index}`,
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_universe_coverage",
    })),
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
  ];
  const calibrationReport = buildStrategyWeightCalibrationReport(events);
  const auditReport = buildStrategyWeightChangeAuditReport(calibrationReport);

  const report = buildStrategyWeightChangeExecutionReport(auditReport, events);

  assert.equal(report.status, "blocked");
  assert.equal(report.blockedRecordCount, 1);
  assert.equal(report.rollbackWatchCount, 1);
  assert.equal(report.canExecuteWeightChange, false);
  assert.match(report.nextStep, /不能执行/);

  assert.equal(report.items[0]?.executionStatus, "blocked_by_audit");
  assert.equal(report.items[1]?.executionStatus, "rollback_watch");
});
