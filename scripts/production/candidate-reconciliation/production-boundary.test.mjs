import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import { Script } from "node:vm";

const execFileAsync = promisify(execFile);
const entrypointPath = "scripts/production/candidate-reconciliation/production-entrypoint.sh";
const runnerPath = "scripts/production/candidate-reconciliation/production-runner.sh";
const modulePath = "scripts/production/candidate-reconciliation/runner.mjs";

test("production shell entrypoints remain syntactically valid", async () => {
  await execFileAsync("bash", ["-n", entrypointPath, runnerPath]);
});

test("entrypoint verifies only current Lineage v3 and launches one bounded session-independent unit", async () => {
  const source = await readFile(entrypointPath, "utf8");
  for (const expectedFragment of [
    "validate-request", "systemd-run", "--collect", "Restart=no", "RuntimeMaxSec=3600",
    "CANDIDATE_RECONCILIATION_ENTRYPOINT_MODE=detached_worker",
    "lineage-final.json", "lineage_evidence_directory_invalid", "lineage_evidence_missing",
    "runtime_parent_directory_invalid",
  ]) assert.match(source, new RegExp(expectedFragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(source, /nohup|disown|foreground_fallback/u);
  assert.match(source, /rm -rf -- "\$\{APPROVED_OPS_ROOT\}" "\$\{APPROVED_SECURE_ROOT\}" "\$\{ACTUAL_SOURCE_ROOT\}"/u);
  assert.doesNotMatch(source, /rm -rf -- "\$\{APPROVED_EVIDENCE_DIRECTORY\}"/u);
  assert.doesNotMatch(source, /rm -rf -- "\$\{LINEAGE_DIRECTORY\}"/u);
  assert.doesNotMatch(source, /observation-final|observation-closeout|observation-samples/u);
});

test("production runner is evidence-only and cannot mutate Git, services, or phase", async () => {
  const source = await readFile(runnerPath, "utf8");
  for (const expectedFragment of [
    "production_mutation_allowed=false", "pre_read_only_query", "consume",
    "reconciliation-result.json", "comparisonDifferences", "candidate_audit_role",
    "automaticPhaseAdvance", "phaseTransitionExecuted", "shadowVerifyTransitionExecuted",
    "candidate-multi-cycle-reconciliation-evidence.v3", "release --outcome PASS",
    "sourceReleaseCount", "candidate-episode-v1-cycle-7",
    "candidate_shadow_worker_not_running", "candidate_reconciliation_runtime_not_ready",
    "CANDIDATE_RECONCILIATION_LINEAGE_EVIDENCE_FILE",
  ]) assert.match(source, new RegExp(expectedFragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.ok(source.indexOf("lease_event consume") < source.indexOf('"${RUNNER_MODULE}" collect'));
  for (const forbidden of [
    'git -C "${ROOT_DIR}" checkout', "fetch --no-tags", '"${COMPOSE[@]}" up',
    '"${COMPOSE[@]}" build', '"${COMPOSE[@]}" restart', '"${DOCKER[@]}" tag',
    "--remove-orphans",
  ]) assert.equal(source.includes(forbidden), false);
  assert.doesNotMatch(source, /shadow_verify|canonical_compat|transition_migration_control_v1/u);
  assert.doesNotMatch(source, /CANDIDATE_ACTIVATION|observation-final|observation-samples/u);
});

test("runtime health probe is valid Node and does not depend on shell interpolation", async () => {
  const source = await readFile(runnerPath, "utf8");
  const probe = source.match(/<<'NODE'\n([\s\S]*?)\nNODE/u)?.[1];
  assert.ok(probe, "runtime health probe heredoc missing");
  assert.doesNotThrow(() => new Script(probe));
  assert.doesNotMatch(probe, new RegExp(`process\\.env|authorization|${"CRON"}_${"SECRET"}`, "u"));
});

test("database collector enforces transaction and role read-only boundaries", async () => {
  const source = await readFile(modulePath, "utf8");
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(source, /SET LOCAL ROLE candidate_audit_role/u);
  assert.match(source, /current_user AS current_role/u);
  assert.match(source, /database_audit_role_not_active/u);
  assert.match(source, /database_transaction_not_read_only/u);
  assert.match(source, /database_transaction_isolation_invalid/u);
  assert.match(source, /source_release_outside_lineage_present/u);
  assert.match(source, /sourceReleaseWindows/u);
  assert.match(source, /database_control_lineage_count_mismatch/u);
  assert.match(source, /database_control_lineage_state_mismatch/u);
  assert.match(source, /lineage_evidence_checksum_mismatch/u);
  assert.doesNotMatch(source, /PASS_ACTIVATE_AND_OBSERVE|activationEvidenceSha256/u);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/u);
});
