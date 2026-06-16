import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { runAdminStrategyWeightChangeExecutionRecord } from "./strategy-weight-change-execution-admin";

const execution = {
  approvalStatus: "approved" as const,
  approvedAt: "2026-06-16T09:00:00+08:00",
  approvedBy: "chuan",
  direction: "increase" as const,
  label: "成交量/OI 权重复核",
  rollbackTrigger: "后续 10 个样本反证率超过 45%",
  rollbackWindowDays: 14,
  tag: "review_volume_oi_weight",
  versionLabel: "manual-volume-oi-weight-v1",
};

test("runAdminStrategyWeightChangeExecutionRecord refuses to run when CRON_SECRET is missing", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runAdminStrategyWeightChangeExecutionRecord({
    authorization: "Bearer test",
    body: { execution },
    env: {},
    repository,
  });

  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error, "strategy_weight_execution_secret_missing");
});

test("runAdminStrategyWeightChangeExecutionRecord rejects the wrong bearer token", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runAdminStrategyWeightChangeExecutionRecord({
    authorization: "Bearer wrong",
    body: { execution },
    env: { CRON_SECRET: "correct" },
    repository,
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error, "unauthorized");
});

test("runAdminStrategyWeightChangeExecutionRecord records a protected manual ledger event without changing weights", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runAdminStrategyWeightChangeExecutionRecord({
    authorization: "Bearer correct",
    body: { execution },
    env: { CRON_SECRET: "correct" },
    repository,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    return;
  }

  assert.equal(result.body.entry.action, "strategy_weight_change_execution");
  assert.equal(result.body.entry.allowedUse, "research_only");
  assert.equal(result.body.entry.canAutoAdjustWeights, false);
  assert.equal(result.body.entry.strategyWeightChange?.canExecuteWeightChange, false);
  assert.equal(result.body.entry.strategyWeightChange?.approvalStatus, "approved");
  assert.equal(result.body.entry.strategyWeightChange?.tag, "review_volume_oi_weight");
  assert.equal(result.body.entry.strategyWeightChange?.rollbackWindowDays, 14);
  assert.equal(result.body.entries[0]?.id, result.body.entry.id);
  assert.equal(result.body.rankProfile.totalXp, 0);
  assert.equal(result.body.storage, "memory");
  assert.equal(result.body.scope, "public-demo");
});

test("runAdminStrategyWeightChangeExecutionRecord rejects incomplete execution payloads", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runAdminStrategyWeightChangeExecutionRecord({
    authorization: "Bearer correct",
    body: {
      execution: {
        ...execution,
        rollbackWindowDays: 0,
      },
    },
    env: { CRON_SECRET: "correct" },
    repository,
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error, "invalid_strategy_weight_execution_request");
});
