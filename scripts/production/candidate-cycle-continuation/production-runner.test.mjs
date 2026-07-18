import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const path = "scripts/production/candidate-cycle-continuation/production-runner.sh";

test("runner preserves the Web rollback image and starts from an absent Candidate worker", async () => {
  await execFileAsync("bash", ["-n", path]);
  const { stdout } = await execFileAsync("bash", [path], {
    env: { ...process.env, CANDIDATE_CYCLE_CONTINUATION_MODE: "dry_run" },
  });
  assert.match(stdout, /DRY-RUN: no production Git, image, environment, database control or service mutation/u);
  const source = await readFile(path, "utf8");
  for (const token of [
    "rollbackWebImageRef", "candidate_baseline_worker_not_absent", "control-preflight", "control-continue",
    "render-disabled-env", "control-rollback", "candidate-shadow-worker", "production-check.sh",
    "observation-checkpoint", "systemd-run", "RuntimeMaxSec=260000", "/runtime/env.production",
    "ROLLBACK_INCOMPLETE_LEASE_RETAINED",
  ]) assert.match(source, new RegExp(token, "u"));
  assert.ok(source.indexOf("control-continue") < source.indexOf("control-continuation-redacted.json"));
  assert.doesNotMatch(source, /docker compose down|docker volume rm|git reset --hard|DROP TABLE|TRUNCATE/u);
  assert.doesNotMatch(source, /rollbackWorkerImageRef|rollback_candidate_worker_missing/u);
});

test("rollback never reactivates the expired old cycle", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /freezing new cycle and restoring Legacy authority/u);
  assert.doesNotMatch(source, /transition.*currentMigrationId.*shadow_capture/su);
});

test("rollback accepts the clean approved target compose while preflight binds the baseline compose", async () => {
  const source = await readFile(path, "utf8");
  const modeBoundary = source.indexOf('if [[ "${RUNNER_MODE}" == "production_continue" ]]');
  const composeCheck = source.indexOf('$(sha_file "${COMPOSE_FILE}")');
  const rollbackBranch = source.indexOf("\nelse\n", modeBoundary);

  assert.ok(modeBoundary >= 0);
  assert.ok(composeCheck > modeBoundary);
  assert.ok(composeCheck < rollbackBranch);
  assert.match(source, /production_base_env_checksum_mismatch/u);
  assert.match(source, /production_rollback_source_identity_mismatch/u);
});
