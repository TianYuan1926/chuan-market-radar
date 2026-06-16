import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  runAdminOutcomeExecutor,
  type AdminOutcomeExecutorResponse,
} from "./outcome-executor-admin";
import type { RunOutcomeExecutorOptions } from "./outcome-executor";

function assertError(
  response: AdminOutcomeExecutorResponse,
  expected: {
    error: string;
    status: number;
  },
) {
  assert.equal(response.status, expected.status);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, expected.error);
  }
}

test("runAdminOutcomeExecutor refuses to run when CRON_SECRET is missing", async () => {
  let called = false;
  const response = await runAdminOutcomeExecutor({
    authorization: "Bearer anything",
    env: {},
    executor: async () => {
      called = true;
      throw new Error("should not execute");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "outcome_executor_secret_missing",
    status: 503,
  });
  assert.equal(called, false);
});

test("runAdminOutcomeExecutor rejects requests with the wrong bearer token", async () => {
  let called = false;
  const response = await runAdminOutcomeExecutor({
    authorization: "Bearer wrong",
    env: {
      CRON_SECRET: "correct-secret",
    },
    executor: async () => {
      called = true;
      throw new Error("should not execute");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "unauthorized",
    status: 401,
  });
  assert.equal(called, false);
});

test("runAdminOutcomeExecutor runs the outcome executor after authorization", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const response = await runAdminOutcomeExecutor({
    authorization: "Bearer correct-secret",
    env: {
      CRON_SECRET: "correct-secret",
      OUTCOME_EXECUTOR_EVENT_LIMIT: "25",
    },
    executor: async (options: RunOutcomeExecutorOptions) => {
      assert.equal(options.repository, repository);
      assert.equal(options.limit, 25);

      return {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        dueEvents: 1,
        failedFetches: 0,
        failures: [],
        fetchedCandles: 12,
        mode: "outcome_executor_mvp",
        scannedEvents: 4,
        skippedReasons: [],
        skippedEvents: 0,
        writtenEvents: 1,
      };
    },
    repository,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.storage, "memory");
    assert.equal(response.body.scope, "chuan-public");
    assert.equal(response.body.outcomeExecutor.writtenEvents, 1);
    assert.equal(response.body.outcomeExecutor.canAutoAdjustWeights, false);
  }
});
