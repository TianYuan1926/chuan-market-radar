import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "scripts/production/candidate-cycle-continuation/production-entrypoint.sh",
  "scripts/production/candidate-cycle-continuation/production-runner.sh",
  "scripts/production/candidate-cycle-continuation/observation-runner.sh",
];

test("production packet never mutates scanner Redis migrations or canonical authority", async () => {
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const forbidden of [
    "scanner-worker", "redis-cli FLUSH", "npm run migration", "prisma migrate",
    "CANDIDATE_EPISODE_CANONICAL_READ=true", "CANDIDATE_EPISODE_CANONICAL_WRITE=true",
    "backtest:formal",
  ]) assert.doesNotMatch(source, new RegExp(forbidden, "u"));
  assert.match(source, /service_allowlist=web,candidate-shadow-worker/u);
  assert.match(source, /candidate_baseline_worker_not_absent/u);
  assert.match(source, /ROLLBACK_INCOMPLETE_LEASE_RETAINED/u);
  assert.doesNotMatch(source, /rollbackWorkerImageRef/u);
});

test("observer retains evidence before exact temporary cleanup", async () => {
  const source = await readFile(files[2], "utf8");
  assert.ok(source.indexOf("retain_evidence") < source.lastIndexOf("cleanup_temporary_artifacts"));
  assert.match(source, /PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE/u);
  assert.match(source, /lease_event release --outcome PASS_OBSERVATION/u);
  assert.match(source, /automatic_rollback/u);
});

test("observer forwards the sample combiner heredoc into the isolated Node container", async () => {
  const source = await readFile(files[2], "utf8");
  assert.match(source, /\$\{DOCKER\[@\]\} run --rm -i --network none --read-only/u);
  assert.match(source, /run_node true - "\$\{HEALTH_FILE\}" "\$\{API_FILE\}" "\$\{DB_BEFORE_FILE\}" \\\n+    "\$\{DB_AFTER_FILE\}" "\$\{SAMPLE_FILE\}" <<'NODE'/u);
  assert.match(source, /candidate-validation-cycle-observation-sample\.v3/u);
});

test("observer waits for strict fresh health before Candidate write and sample append", async () => {
  const source = await readFile(files[2], "utf8");
  const script = source.match(/web node - > "\$\{HEALTH_FILE\}" <<'NODE'\n([\s\S]*?)\nNODE/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  const agingRetry = source.indexOf('classification.action !== "retry_aging"');
  const databaseBefore = source.indexOf('database_snapshot > "${DB_BEFORE_FILE}"');
  const candidateWrite = source.indexOf('/api/admin/candidate-shadow/run');
  const databaseAfter = source.indexOf('database_snapshot > "${DB_AFTER_FILE}"');
  const sampleAppend = source.indexOf('cat "${SAMPLE_FILE}" >> "${SAMPLES_FILE}"');
  assert.ok(agingRetry >= 0 && databaseBefore > agingRetry);
  assert.ok(candidateWrite > databaseBefore && databaseAfter > candidateWrite);
  assert.ok(sampleAppend > databaseAfter);
  assert.match(source, /cycle_observation_health_recheck_exhausted/u);
  assert.match(source, /MAXIMUM_HEALTH_RECHECK_SECONDS/u);
  assert.match(source, /HEALTH_RECHECK_INTERVAL_SECONDS/u);
});

test("pre-observation rollback removes only bounded temporary transaction artifacts", async () => {
  const source = await readFile(files[1], "utf8");
  assert.match(source, /cleanup_failed_transaction_artifacts/u);
  assert.match(source, /temporaryArtifactCleanupRequired/u);
  assert.match(source, /cleanup_target_image_still_in_use/u);
  assert.match(source, /cleanup_image_inventory_failed/u);
  assert.match(source, /cleanup_candidate_container_check_failed/u);
  assert.match(source, /cleanup_git_identity_check_failed/u);
  assert.match(source, /\$\{DOCKER\[@\]\} image rm "\$\{ROLLBACK_WEB_REF\}"/u);
  assert.match(source, /rm -rf -- "\$\{OPS_ROOT\}" "\$\{SECURE_ROOT\}" "\$\{SOURCE_ROOT\}"/u);
  assert.doesNotMatch(source, /rm -rf --[^\n]*EVIDENCE_DIRECTORY/u);
  assert.ok(source.indexOf("bounded_rollback") < source.lastIndexOf("cleanup_failed_transaction_artifacts"));
});

test("observation rollback removes failed target images without deleting retained evidence", async () => {
  const source = await readFile(files[2], "utf8");
  assert.match(source, /cleanup_rollback_image_artifacts/u);
  assert.match(source, /cleanup_target_image_still_in_use/u);
  assert.match(source, /cleanup_image_inventory_failed/u);
  assert.match(source, /cleanup_candidate_container_check_failed/u);
  assert.match(source, /\$\{DOCKER\[@\]\} image rm "\$\{ROLLBACK_WEB_REF\}"/u);
  assert.doesNotMatch(source, /rm -rf --[^\n]*EVIDENCE_DIRECTORY/u);
  assert.match(source, /retain_evidence ROLLBACK_TO_LEGACY_AUTHORITY\n\s+cleanup_rollback_image_artifacts\n\s+cleanup_temporary_artifacts/u);
});
