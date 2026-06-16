import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, StrategyWeightChangeExecutionRecord } from "@/lib/analysis/types";
import { buildStrategyWeightShadowReport } from "./strategy-weight-shadow";

function executionRecord({
  approvalStatus = "approved",
  createdAt = "2026-06-16T09:00:00.000Z",
  direction,
  id,
  tag,
  versionLabel,
}: {
  approvalStatus?: StrategyWeightChangeExecutionRecord["approvalStatus"];
  createdAt?: string;
  direction: StrategyWeightChangeExecutionRecord["direction"];
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
      direction,
      rollbackTrigger: "如果未来 14 天新增 3 个反证样本，进入人工回滚复核。",
      rollbackWindowDays: 14,
      tag,
      versionLabel,
    },
    symbol: "STRATEGY",
    title: "人工权重变更执行记录",
  };
}

test("buildStrategyWeightShadowReport keeps empty shadow weights in collecting mode", () => {
  const report = buildStrategyWeightShadowReport([]);

  assert.equal(report.mode, "strategy_weight_shadow_readonly_mvp");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.canAffectLiveSignals, false);
  assert.equal(report.status, "collecting");
  assert.deepEqual(report.baseWeights, []);
  assert.deepEqual(report.shadowWeights, []);
  assert.deepEqual(report.diffs, []);
  assert.match(report.guardrail, /不影响真实扫描/);
});

test("buildStrategyWeightShadowReport applies approved records only to shadow output", () => {
  const report = buildStrategyWeightShadowReport([
    executionRecord({
      direction: "increase",
      id: "pending-volume",
      approvalStatus: "pending_approval",
      tag: "review_volume_oi_weight",
      versionLabel: "pending-volume-v1",
    }),
    executionRecord({
      direction: "increase",
      id: "approved-volume",
      tag: "review_volume_oi_weight",
      versionLabel: "approved-volume-v1",
    }),
    executionRecord({
      createdAt: "2026-06-16T09:10:00.000Z",
      direction: "decrease",
      id: "approved-short",
      tag: "review_short_side_detection",
      versionLabel: "approved-short-v1",
    }),
    executionRecord({
      createdAt: "2026-06-16T09:20:00.000Z",
      direction: "quarantine",
      id: "approved-universe",
      tag: "review_universe_coverage",
      versionLabel: "approved-universe-v1",
    }),
  ]);

  assert.equal(report.status, "blocked");
  assert.equal(report.canAffectLiveSignals, false);
  assert.equal(report.approvedRecordCount, 3);
  assert.equal(report.ignoredRecordCount, 1);
  assert.equal(report.diffs.length, 3);
  assert.deepEqual(report.shadowWeights.map((item) => [item.tag, item.weight]), [
    ["review_universe_coverage", 0],
    ["review_short_side_detection", 90],
    ["review_volume_oi_weight", 110],
  ]);

  const increase = report.diffs.find((item) => item.tag === "review_volume_oi_weight");
  const decrease = report.diffs.find((item) => item.tag === "review_short_side_detection");
  const quarantine = report.diffs.find((item) => item.tag === "review_universe_coverage");

  assert.equal(increase?.baseWeight, 100);
  assert.equal(increase?.shadowWeight, 110);
  assert.equal(increase?.delta, 10);
  assert.equal(increase?.direction, "increase");
  assert.equal(increase?.canAffectLiveSignals, false);
  assert.equal(increase?.versionLabel, "approved-volume-v1");
  assert.equal(decrease?.shadowWeight, 90);
  assert.equal(decrease?.delta, -10);
  assert.equal(quarantine?.shadowWeight, 0);
  assert.equal(quarantine?.delta, -100);
  assert.match(report.nextStep, /隔离/);
});
