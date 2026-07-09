import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("confirmed production deploy passes explicit confirmation into automatic rollback", () => {
  const source = read("scripts/deploy/auto-deploy.sh");

  assert.match(source, /ROLLBACK_MODE="production_rollback"/);
  assert.match(source, /CONFIRM_ROLLBACK="true"/);
});

test("production check allows the documented startup grace before declaring readiness failure", () => {
  const source = read("scripts/verify/production-check.sh");

  assert.match(source, /READY_TIMEOUT_SECONDS="\$\{READY_TIMEOUT_SECONDS:-600\}"/);
  assert.match(source, /SHADOW_READY_TIMEOUT_SECONDS="\$\{SHADOW_READY_TIMEOUT_SECONDS:-660\}"/);
});

test("production check requires a fresh Shadow runner heartbeat", () => {
  const source = read("scripts/verify/production-check.sh");

  assert.match(source, /exec -T shadow-runner sh -lc .*shadow-tracking\.js health/);
  assert.match(source, /shadow runner is not ready/);
  assert.match(source, /ps .*shadow-runner/);
});

test("production evidence captures Shadow runner status and logs", () => {
  const compose = read("docker-compose.yml");
  const facts = read("scripts/audit/collect-production-facts.sh");

  assert.match(compose, /SHADOW_REPORTS_DIR: \$\{SHADOW_REPORTS_DIR:-\/app\/reports\//);
  assert.match(compose, /SHADOW_RUN_ID: \$\{SHADOW_RUN_ID:-shadow-v1-/);
  assert.match(facts, /logs --tail=120 .*shadow-runner/);
  assert.match(facts, /ps shadow-runner/);
});
