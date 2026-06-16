import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus, StrategyWeightChangeExecutionRecord } from "@/lib/analysis/types";
import { buildStrategyWeightChangeAuditReport } from "./strategy-weight-change-audit";
import { buildStrategyWeightChangeExecutionReport } from "./strategy-weight-change-execution";
import { buildStrategyWeightActivationGate } from "./strategy-weight-activation-gate";
import { buildStrategyWeightCalibrationReport } from "./strategy-weight-calibration";
import { buildStrategyWeightShadowReport } from "./strategy-weight-shadow";
import { buildStrategyWeightShadowEvaluationReport } from "./strategy-weight-shadow-evaluation";

function executionRecord({
  approvalStatus = "approved",
  createdAt,
  direction,
  id,
  rollbackTrigger = "如果未来 14 天新增 3 个反证样本，进入人工回滚复核。",
  rollbackWindowDays = 14,
  tag,
  versionLabel,
}: {
  approvalStatus?: StrategyWeightChangeExecutionRecord["approvalStatus"];
  createdAt: string;
  direction: StrategyWeightChangeExecutionRecord["direction"];
  id: string;
  rollbackTrigger?: string;
  rollbackWindowDays?: number;
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
      approvedAt: createdAt,
      approvedBy: "chuan",
      canExecuteWeightChange: false,
      direction,
      rollbackTrigger,
      rollbackWindowDays,
      tag,
      versionLabel,
    },
    symbol: "STRATEGY",
    title: "人工权重变更执行记录",
  };
}

function calibrationReview({
  createdAt,
  id,
  outcomeStatus,
  result,
  tag,
}: {
  createdAt: string;
  id: string;
  outcomeStatus: SignalOutcomeStatus;
  result?: JournalEvent["result"];
  tag: string;
}): JournalEvent {
  return {
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: tag,
    canAutoAdjustWeights: false,
    createdAt,
    id,
    note: "真实权重启用前的校准样本。",
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
  createdAt,
  id,
  tag,
  versionLabel,
}: {
  createdAt: string;
  id: string;
  tag: string;
  versionLabel: string;
}): JournalEvent {
  return {
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: tag,
    canAutoAdjustWeights: false,
    createdAt,
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

function buildReports(events: JournalEvent[]) {
  const calibration = buildStrategyWeightCalibrationReport(events);
  const audit = buildStrategyWeightChangeAuditReport(calibration);
  const execution = buildStrategyWeightChangeExecutionReport(audit, events);
  const shadow = buildStrategyWeightShadowReport(events);
  const shadowEvaluation = buildStrategyWeightShadowEvaluationReport({
    events,
    shadowReport: shadow,
  });

  return {
    execution,
    shadow,
    shadowEvaluation,
  };
}

test("buildStrategyWeightActivationGate defaults to disabled and cannot affect live signals", () => {
  const reports = buildReports([]);
  const gate = buildStrategyWeightActivationGate({
    activationMode: undefined,
    executionReport: reports.execution,
    shadowEvaluationReport: reports.shadowEvaluation,
    shadowReport: reports.shadow,
  });

  assert.equal(gate.mode, "strategy_weight_activation_gate_mvp");
  assert.equal(gate.activationMode, "disabled");
  assert.equal(gate.status, "active_disabled_by_config");
  assert.equal(gate.allowedUse, "research_only");
  assert.equal(gate.canAutoAdjustWeights, false);
  assert.equal(gate.canAffectLiveSignals, false);
  assert.equal(gate.canWriteRuleWeights, false);
  assert.equal(gate.eligibleForManualActivation, false);
  assert.equal(gate.blockerCount > 0, true);
  assert.match(gate.guardrail, /不会改变扫描/);
  assert.match(gate.nextStep, /配置关闭/);
});

test("buildStrategyWeightActivationGate blocks manual mode when samples or rollback plans are incomplete", () => {
  const events: JournalEvent[] = [
    strategyConfirmation({
      createdAt: "2026-06-12T10:00:00.000Z",
      id: "confirm-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-v1",
    }),
    executionRecord({
      createdAt: "2026-06-12T10:30:00.000Z",
      direction: "increase",
      id: "execute-volume",
      rollbackTrigger: "",
      rollbackWindowDays: 0,
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-v1",
    }),
    calibrationReview({
      createdAt: "2026-06-12T10:31:00.000Z",
      id: "volume-valid-0",
      outcomeStatus: "partial_win",
      result: "win",
      tag: "review_volume_oi_weight",
    }),
    calibrationReview({
      createdAt: "2026-06-12T10:32:00.000Z",
      id: "volume-valid-1",
      outcomeStatus: "saved",
      result: "saved",
      tag: "review_volume_oi_weight",
    }),
  ];
  const reports = buildReports(events);
  const gate = buildStrategyWeightActivationGate({
    activationMode: "manual",
    executionReport: reports.execution,
    shadowEvaluationReport: reports.shadowEvaluation,
    shadowReport: reports.shadow,
  });

  assert.equal(gate.activationMode, "manual");
  assert.equal(gate.status, "blocked");
  assert.equal(gate.eligibleForManualActivation, false);
  assert.equal(
    gate.checks.find((check: { id: string; status: string }) => check.id === "sample_floor")?.status,
    "blocked",
  );
  assert.equal(
    gate.checks.find((check: { id: string; status: string }) => check.id === "rollback_plan")?.status,
    "blocked",
  );
  assert.match(gate.blockers.join(" "), /样本/);
  assert.match(gate.blockers.join(" "), /回滚/);
  assert.match(gate.nextStep, /补齐/);
});

test("buildStrategyWeightActivationGate marks manual activation eligible only after every guard passes", () => {
  const tag = "review_volume_oi_weight";
  const events: JournalEvent[] = [
    ...Array.from({ length: 5 }, (_, index) => calibrationReview({
      createdAt: `2026-06-12T09:0${index}:00.000Z`,
      id: `volume-pre-valid-${index}`,
      outcomeStatus: "partial_win",
      result: "win",
      tag,
    })),
    strategyConfirmation({
      createdAt: "2026-06-12T10:00:00.000Z",
      id: "confirm-volume",
      tag,
      versionLabel: "draft-volume-v1",
    }),
    executionRecord({
      createdAt: "2026-06-12T10:30:00.000Z",
      direction: "increase",
      id: "execute-volume",
      tag,
      versionLabel: "draft-volume-v1",
    }),
    ...Array.from({ length: 5 }, (_, index) => calibrationReview({
      createdAt: `2026-06-12T10:3${index + 1}:00.000Z`,
      id: `volume-shadow-valid-${index}`,
      outcomeStatus: index === 4 ? "loss" : "saved",
      result: index === 4 ? "loss" : "saved",
      tag,
    })),
  ];
  const reports = buildReports(events);
  const gate = buildStrategyWeightActivationGate({
    activationMode: "manual",
    executionReport: reports.execution,
    shadowEvaluationReport: reports.shadowEvaluation,
    shadowReport: reports.shadow,
  });

  assert.equal(gate.activationMode, "manual");
  assert.equal(gate.status, "eligible_for_manual_activation");
  assert.equal(gate.eligibleForManualActivation, true);
  assert.equal(gate.eligibleDiffCount, 1);
  assert.equal(gate.blockerCount, 0);
  assert.equal(gate.checks.every((check: { status: string }) => check.status === "passed"), true);
  assert.match(gate.guardrail, /仍需单独发布/);
  assert.match(gate.nextStep, /人工启用候选/);
});
