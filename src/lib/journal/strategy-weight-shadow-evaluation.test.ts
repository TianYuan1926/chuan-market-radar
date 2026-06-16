import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalOutcomeStatus, StrategyWeightChangeExecutionRecord } from "@/lib/analysis/types";
import { buildStrategyWeightShadowReport } from "./strategy-weight-shadow";
import { buildStrategyWeightShadowEvaluationReport } from "./strategy-weight-shadow-evaluation";

function executionRecord({
  createdAt,
  direction,
  id,
  rollbackTrigger = "如果未来 14 天新增 3 个反证样本，进入人工回滚复核。",
  tag,
  versionLabel,
}: {
  createdAt: string;
  direction: StrategyWeightChangeExecutionRecord["direction"];
  id: string;
  rollbackTrigger?: string;
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
      approvalStatus: "approved",
      approvedAt: createdAt,
      approvedBy: "chuan",
      canExecuteWeightChange: false,
      direction,
      rollbackTrigger,
      rollbackWindowDays: 14,
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
    note: "影子权重观察期校准样本。",
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

test("buildStrategyWeightShadowEvaluationReport keeps empty shadow output in insufficient mode", () => {
  const report = buildStrategyWeightShadowEvaluationReport({
    events: [],
    shadowReport: buildStrategyWeightShadowReport([]),
  });

  assert.equal(report.mode, "strategy_weight_shadow_evaluation_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canAffectLiveSignals, false);
  assert.equal(report.status, "insufficient_samples");
  assert.equal(report.items.length, 0);
  assert.equal(report.evaluatedShadowCount, 0);
  assert.match(report.guardrail, /不执行真实权重/);
});

test("buildStrategyWeightShadowEvaluationReport evaluates post approval samples and rollback pressure only", () => {
  const events: JournalEvent[] = [
    executionRecord({
      createdAt: "2026-06-10T00:00:00.000Z",
      direction: "increase",
      id: "execute-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-v1",
    }),
    calibrationReview({
      createdAt: "2026-06-09T00:00:00.000Z",
      id: "volume-old-loss",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_volume_oi_weight",
    }),
    ...Array.from({ length: 4 }, (_, index) => calibrationReview({
      createdAt: `2026-06-1${index + 1}T00:00:00.000Z`,
      id: `volume-valid-${index}`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
      tag: "review_volume_oi_weight",
    })),
    calibrationReview({
      createdAt: "2026-06-15T00:00:00.000Z",
      id: "volume-loss",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_volume_oi_weight",
    }),
    strategyConfirmation({
      createdAt: "2026-06-16T00:00:00.000Z",
      id: "confirm-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-v1",
    }),
    executionRecord({
      createdAt: "2026-06-10T00:00:00.000Z",
      direction: "decrease",
      id: "execute-short",
      tag: "review_short_side_detection",
      versionLabel: "draft-short-v1",
    }),
    ...Array.from({ length: 3 }, (_, index) => calibrationReview({
      createdAt: `2026-06-1${index + 1}T12:00:00.000Z`,
      id: `short-loss-${index}`,
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_short_side_detection",
    })),
    executionRecord({
      createdAt: "2026-06-10T00:00:00.000Z",
      direction: "quarantine",
      id: "execute-universe",
      tag: "review_universe_coverage",
      versionLabel: "draft-universe-v1",
    }),
    calibrationReview({
      createdAt: "2026-06-11T00:00:00.000Z",
      id: "universe-loss",
      outcomeStatus: "loss",
      result: "loss",
      tag: "review_universe_coverage",
    }),
  ];

  const report = buildStrategyWeightShadowEvaluationReport({
    events,
    shadowReport: buildStrategyWeightShadowReport(events),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.evaluatedShadowCount, 3);
  assert.equal(report.improvingCount, 1);
  assert.equal(report.rollbackWatchCount, 1);
  assert.equal(report.blockedCount, 1);
  assert.equal(report.totalPostApprovalSamples, 9);

  const volume = report.items.find((item) => item.tag === "review_volume_oi_weight");
  const short = report.items.find((item) => item.tag === "review_short_side_detection");
  const universe = report.items.find((item) => item.tag === "review_universe_coverage");

  assert.equal(volume?.status, "improving");
  assert.equal(volume?.postApprovalSamples, 5);
  assert.equal(volume?.validatedSamples, 4);
  assert.equal(volume?.rejectedSamples, 1);
  assert.equal(volume?.validationRatePercent, 80);
  assert.equal(volume?.rejectionRatePercent, 20);
  assert.equal(volume?.rollbackTriggerMatched, false);
  assert.equal(volume?.matchingConfirmations, 1);
  assert.match(volume?.nextAction ?? "", /继续观察/);

  assert.equal(short?.status, "rollback_watch");
  assert.equal(short?.rejectedSamples, 3);
  assert.equal(short?.rollbackTriggerMatched, true);
  assert.equal(short?.rollbackPressure, "high");
  assert.match(short?.nextAction ?? "", /回滚/);

  assert.equal(universe?.status, "blocked");
  assert.equal(universe?.postApprovalSamples, 1);
  assert.equal(universe?.rollbackPressure, "blocking");
  assert.match(universe?.nextAction ?? "", /隔离/);
});
