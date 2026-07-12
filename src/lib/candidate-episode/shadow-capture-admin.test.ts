import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { CandidateShadowCaptureComposition } from "./shadow-capture-composition";
import { runAdminCandidateShadowCapture } from "./shadow-capture-admin";

function dormantComposition() {
  return new CandidateShadowCaptureComposition({
    codeActivationAllowed: false,
    consumerTransactions: null,
    env: {
      CANDIDATE_EPISODE_SHADOW_WRITE: "false",
      CANDIDATE_RUNTIME_RELEASE_ID: "disabled",
    },
    repository: createMemoryPersistenceRepository({ scope: "chuan-prod" }),
    monitorTransactions: null,
    sourceTransactions: null,
  });
}

test("candidate shadow admin endpoint rejects missing secret and wrong authorization", async () => {
  const missing = await runAdminCandidateShadowCapture({
    composition: dormantComposition(),
    env: {},
  });
  assert.equal(missing.status, 503);
  assert.deepEqual(missing.body, { ok: false, error: "runtime_secret_missing" });

  const unauthorized = await runAdminCandidateShadowCapture({
    authorization: "Bearer wrong",
    composition: dormantComposition(),
    env: { CRON_SECRET: "test-secret" },
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthorized.body, { ok: false, error: "unauthorized" });
});

test("authorized request reports dormant truth without manufacturing a processed batch", async () => {
  const result = await runAdminCandidateShadowCapture({
    authorization: "Bearer test-secret",
    composition: dormantComposition(),
    env: {
      CANDIDATE_SHADOW_BATCH_LIMIT: "1000",
      CRON_SECRET: "test-secret",
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  if (result.body.ok) {
    assert.equal(result.body.mode, "dormant");
    assert.equal(result.body.batch, null);
    assert.deepEqual(result.body.metricCounts, {});
    assert.equal(result.body.runtime.blockers.includes("release_not_authorized_in_code"), true);
  }
});
