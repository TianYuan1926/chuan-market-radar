import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerPath =
  "scripts/production/candidate-shadow-verify-release/production-runner.sh";
const entrypointPath =
  "scripts/production/candidate-shadow-verify-release/production-entrypoint.sh";

test("runner is Web-only, fenced, reversible and preserves Candidate truth", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /build web/u);
  assert.match(source, /up -d --no-deps --no-build --force-recreate web/u);
  assert.match(source, /retain-rollback-image/u);
  assert.match(source, /safety-checkpoint --checkpoint rollback/u);
  assert.match(source, /ROLLBACK_SHADOW_VERIFY_CODE_RELEASE_VERIFIED/u);
  assert.match(source, /BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE/u);
  assert.match(source, /SET LOCAL ROLE candidate_audit_role/u);
  assert.match(source, /phase='shadow_capture' AND write_frozen=false/u);
  assert.match(source, /candidate_read_control_unavailable/u);
  assert.match(source, /candidate_read_trusted_context_invalid/u);
  assert.match(source, /candidate-read-authority\.json/u);
  assert.match(source, /verify_worker_identity/u);
  assert.match(source, /verify_non_web/u);
  assert.match(source, /verify_evidence/u);
  assert.match(source, /observation_sample_count_insufficient/u);
  assert.doesNotMatch(source, /\b(psql|redis-cli)\b/u);
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/u);
  assert.doesNotMatch(source, /(?:stop|rm|restart|force-recreate) candidate-shadow-worker/u);
  assert.doesNotMatch(source, /(?:build|force-recreate) scanner-worker/u);
  assert.doesNotMatch(source, />\s*.*candidate-read-authority\.json/u);
});

test("entrypoint strips rehearsal controls and launches Restart=no detached unit", async () => {
  const source = await readFile(entrypointPath, "utf8");
  assert.match(source, /--property=Restart=no/u);
  assert.match(source, /--property=RuntimeMaxSec=5400/u);
  assert.match(source, /SHADOW_VERIFY_RELEASE_ENTRYPOINT_MODE=detached_worker/u);
  assert.match(source, /unset ROOT_DIR_OVERRIDE SHADOW_VERIFY_RELEASE_REHEARSAL/u);
  assert.match(source, /unset TRUST_ROOT_OVERRIDE TRANSPORT_MANIFEST_OVERRIDE/u);
  assert.match(source, /rm -rf -- "\$\{ACTUAL_ROOT\}"/u);
  assert.match(source, /candidate-shadow-verify-release\/bundle\.mjs validate-request/u);
});
