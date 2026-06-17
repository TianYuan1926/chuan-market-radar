import assert from "node:assert/strict";
import test from "node:test";
import type { RunForwardMapReviewExecutorOptions } from "./forward-map-review-executor";
import { createMemoryPersistenceRepository } from "../../persistence/persistence-store";
import { runAdminForwardMapReviewExecutor } from "./forward-map-review-admin";

function executorResult() {
  return {
    allowedUse: "research_only" as const,
    canAutoAdjustWeights: false as const,
    failedFetches: 0,
    failures: [],
    fetchedCandles: 0,
    mode: "v3_forward_map_review_executor_mvp" as const,
    reviewedSnapshots: 0,
    scannedSnapshots: 0,
    skippedReasons: [],
    skippedSnapshots: 0,
    writtenEvents: 0,
  };
}

test("runAdminForwardMapReviewExecutor refuses to run when CRON_SECRET is missing", async () => {
  const response = await runAdminForwardMapReviewExecutor({
    authorization: null,
    env: {},
    repository: createMemoryPersistenceRepository(),
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.ok ? "" : response.body.error, "forward_map_review_secret_missing");
});

test("runAdminForwardMapReviewExecutor rejects the wrong bearer token", async () => {
  const response = await runAdminForwardMapReviewExecutor({
    authorization: "Bearer wrong",
    env: { CRON_SECRET: "correct" },
    repository: createMemoryPersistenceRepository(),
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.ok ? "" : response.body.error, "unauthorized");
});

test("runAdminForwardMapReviewExecutor runs the review executor after authorization", async () => {
  let captured: RunForwardMapReviewExecutorOptions | undefined;
  const repository = createMemoryPersistenceRepository();
  const response = await runAdminForwardMapReviewExecutor({
    authorization: "Bearer correct",
    env: {
      CRON_SECRET: "correct",
      V3_FORWARD_MAP_REVIEW_LIMIT: "7",
    },
    executor: async (options) => {
      captured = options;

      return executorResult();
    },
    repository,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.ok ? response.body.forwardMapReview.scannedSnapshots : -1, 0);
  assert.equal(captured?.limit, 7);
  assert.equal(captured?.repository, repository);
});
