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

test("production check uses the checksum-bound privileged identity wrapper when required", () => {
  const source = read("scripts/verify/production-check.sh");

  assert.match(source, /ROOT_DIR.*\/home\/ubuntu\/apps\/chuan-market-radar/);
  assert.match(source, /REQUIRE_IDENTITY_WRAPPER="\$\{REQUIRE_IDENTITY_WRAPPER:-true\}"/);
  assert.match(source, /REQUIRE_IDENTITY_WRAPPER="\$\{REQUIRE_IDENTITY_WRAPPER:-false\}"/);
  assert.match(source, /identity_wrapper_configuration_incomplete/);
  assert.match(source, /identity_wrapper_not_root_owned_0700/);
  assert.match(source, /identity_override_not_root_owned_0600/);
  assert.match(source, /identity_wrapper_checksum_mismatch/);
  assert.match(source, /identity_override_checksum_mismatch/);
  assert.match(source, /compose_cmd=\(sudo -n "\$\{IDENTITY_WRAPPER\}"\)/);
});

test("production evidence captures Shadow runner status and logs", () => {
  const compose = read("docker-compose.yml");
  const facts = read("scripts/audit/collect-production-facts.sh");

  assert.match(compose, /SHADOW_REPORTS_DIR: \$\{SHADOW_REPORTS_DIR:-\/app\/reports\//);
  assert.match(compose, /SHADOW_RUN_ID: \$\{SHADOW_RUN_ID:-shadow-v1-/);
  assert.match(facts, /logs --tail=120 .*shadow-runner/);
  assert.match(facts, /ps shadow-runner/);
});

test("Shadow runner uses Node as PID 1 so SIGTERM can clean its runtime lock", () => {
  const compose = read("docker-compose.yml");
  const shadowService = compose.match(/  shadow-runner:\n([\s\S]*?)\n  dynamic-scan-scheduler:/)?.[1] ?? "";

  assert.match(shadowService, /command:\n\s+\[\n\s+"node",\n\s+"\.tmp\/market-tests\/scripts\/shadow\/shadow-tracking\.js",\n\s+"run-loop",/);
  assert.doesNotMatch(shadowService, /"npm",\n\s+"run",\n\s+"shadow:prod:run-loop"/);
});
