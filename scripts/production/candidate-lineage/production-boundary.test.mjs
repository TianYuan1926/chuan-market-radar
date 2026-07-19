import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import { TRANSPORT_FILES } from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const entrypointPath = "scripts/production/candidate-lineage/production-entrypoint.sh";
const runnerPath = "scripts/production/candidate-lineage/production-runner.sh";

test("production shell entrypoints are syntactically valid and contain no service mutation path", async () => {
  await execFileAsync("bash", ["-n", entrypointPath]);
  await execFileAsync("bash", ["-n", runnerPath]);
  const [entrypoint, runner] = await Promise.all([
    readFile(entrypointPath, "utf8"), readFile(runnerPath, "utf8"),
  ]);
  for (const source of [entrypoint, runner]) {
    assert.doesNotMatch(source, /docker\s+compose\s+(?:up|build|restart|stop|rm)/u);
    assert.doesNotMatch(source, /git\s+(?:checkout|switch|pull|reset|clean)/u);
    assert.doesNotMatch(source, /\bpsql\b/u);
    assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/u);
  }
  assert.match(entrypoint, /--property=Restart=no/u);
  assert.match(entrypoint, /RuntimeMaxSec=3600/u);
  assert.match(entrypoint, /rm -rf -- "\$\{APPROVED_OPS_ROOT\}" "\$\{APPROVED_SECURE_ROOT\}" "\$\{ACTUAL_SOURCE_ROOT\}"/u);
  assert.match(runner, /cmp -s .*runtime-before\.txt.*runtime-after\.txt/su);
  assert.match(runner, /--read-only --cap-drop ALL/u);
  assert.match(runner, /--security-opt no-new-privileges/u);
  assert.match(runner,
    /PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH/u);
  assert.match(runner, /candidate-multi-cycle-lineage-evidence\.v3/u);
  assert.match(runner, /validationCycle/u);
  assert.match(runner, /sourceReleaseCount/u);
  assert.match(runner, /\.sourceReleaseCount \/\/ 0.*-eq 7/su);
  assert.match(runner, /\.validationCycle \/\/ 0.*-eq 7/su);
  assert.match(runner, /\.sourceReleaseWindows \| length.*-eq 7/su);
  assert.doesNotMatch(runner, /\.sourceReleaseCount \/\/ 0'\s+"\$\{LINEAGE_OUTPUT\}"\)" -eq 6/su);
  assert.doesNotMatch(runner, /\.validationCycle \/\/ 0'\s+"\$\{LINEAGE_OUTPUT\}"\)" -eq 6/su);
  assert.match(runner, /maximumSampleGapSeconds/u);
  assert.doesNotMatch(runner, /PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION/u);
});

test("database collector proves repeatable-read, read-only, and audit-role boundaries", async () => {
  const source = await readFile("scripts/production/candidate-lineage/runner.mjs", "utf8");
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(source, /SET LOCAL ROLE candidate_audit_role/u);
  assert.match(source, /transaction_isolation/u);
  assert.match(source, /"outsideLineage",/u);
  assert.match(source, /`database_\$\{key\}_not_zero`/u);
});

test("transport is redacted and cannot carry environment, secrets, or application source", () => {
  assert.equal(new Set(TRANSPORT_FILES).size, TRANSPORT_FILES.length);
  for (const path of TRANSPORT_FILES) {
    assert.doesNotMatch(path, /(^|\/)\.env(?:\.|$)/u);
    assert.doesNotMatch(path, /secret|credential|private.?key/iu);
    assert.doesNotMatch(path, /^src\//u);
  }
  assert.ok(TRANSPORT_FILES.includes(
    "docs/governance/wp-g0-2-current-cycle-unified-lineage-capture-production-packet.v4.json",
  ));
  assert.ok(TRANSPORT_FILES.includes(
    "scripts/production/candidate-lineage/production-runner.mjs",
  ));
});
