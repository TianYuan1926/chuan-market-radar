import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entrypointPath = "scripts/production/candidate-activation/production-entrypoint.sh";
const runnerPath = "scripts/production/candidate-activation/production-runner.sh";
const observerPath = "scripts/production/candidate-activation/observation-runner.sh";

test("activation entrypoint only launches a bounded transient systemd unit", async () => {
  const source = await readFile(entrypointPath, "utf8");
  for (const token of [
    "systemd-run", "--collect", "Restart=no", "RuntimeMaxSec=5400",
    "StandardOutput=journal", "CANDIDATE_ACTIVATION_ENTRYPOINT_MODE=detached_worker",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /nohup|disown|foreground_fallback/);
  assert.match(source, /forward_signal TERM 143/);
  assert.match(source, /forward_signal INT 130/);
  assert.match(source, /forward_signal HUP 129/);
  assert.match(source, /rm -rf -- "\$\{APPROVED_OPS_ROOT\}" "\$\{APPROVED_SECURE_ROOT\}" "\$\{ACTUAL_SOURCE_ROOT\}"/);
  assert.doesNotMatch(source, /rm -rf -- "\$\{APPROVED_EVIDENCE_DIRECTORY\}"/);
});

test("activation entrypoint verifies the staged transport before launching", async () => {
  const source = await readFile(entrypointPath, "utf8");
  assert.match(source, /transport-manifest\.json/);
  assert.match(source, /candidate-activation\/bundle\.mjs validate-request/);
  assert.match(source, /--network none --read-only --cap-drop ALL/);
  assert.match(source, /current_web_image_identity_mismatch/);
  assert.match(source, /bundle_marker_mismatch/);
});

test("activation entrypoint creates local-only admin input without printing credentials", async () => {
  const source = await readFile(entrypointPath, "utf8");
  assert.match(source, /postgres-admin\.env/);
  assert.match(source, /sudo -n cat -- "\$\{APPROVED_POSTGRES_ADMIN_ENV\}"/);
  assert.match(source, /prepare-admin-url/);
  assert.match(source, /migration-admin\.url/);
  assert.match(source, /runtime-identity-result\.json/);
  assert.doesNotMatch(source, /echo[^\n]*(?:POSTGRES_PASSWORD|DATABASE_URL)/);
});

test("activation and observer runners do not require host Node", async () => {
  const [runner, observer] = await Promise.all([
    readFile(runnerPath, "utf8"),
    readFile(observerPath, "utf8"),
  ]);
  for (const source of [runner, observer]) {
    assert.match(source, /CANDIDATE_ACTIVATION_NODE_RUNTIME/);
    assert.match(source, /--network none --read-only --cap-drop ALL/);
    assert.match(source, /--security-opt no-new-privileges/);
    assert.match(source, /--entrypoint node/);
    assert.doesNotMatch(source, /required_command_missing:node/);
  }
});

test("database control runner uses the staging owner for private bind mounts", async () => {
  const source = await readFile(runnerPath, "utf8");
  const databaseRunner = source.match(/database_runner\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(databaseRunner, /--user "\$\(id -u\):\$\(id -g\)"/);
  assert.match(databaseRunner, /--volume "\$\{SOURCE_ROOT\}:\$\{SOURCE_ROOT\}:ro"/);
  assert.match(databaseRunner, /--volume "\$\{SECURE_ROOT\}:\$\{SECURE_ROOT\}:ro"/);
});

test("production runner uses one lease, detached Git and an exact retained image", async () => {
  const source = await readFile(runnerPath, "utf8");
  for (const token of [
    "lease_acquire", "lease_checkpoint pre_mutation", "lease_consume",
    "lease_release SAFE_STOP_PRE_MUTATION",
    "lease_safety_checkpoint rollback", "lease_release ROLLBACK_PASS",
    "git -C \"${ROOT_DIR}\" checkout --detach", "fetch --no-tags origin",
    "market-radar-rollback/wp-g0-2-candidate-activation", "rollback_image_retention_mismatch",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(source.indexOf("lease_consume") < source.indexOf("checkout --detach \"${APPROVED_COMMIT}\""));
  assert.doesNotMatch(source, /git merge|git branch -f main|git checkout main|--remove-orphans/);
});

test("observer checks revocation throughout the 24 hour window and never advances phase", async () => {
  const source = await readFile(observerPath, "utf8");
  assert.match(source, /observation-checkpoint/);
  assert.match(source, /lease_observation_checkpoint "sample_\$\{sample_number\}_preflight"/);
  assert.match(source, /lease_release_observation/);
  assert.match(source, /PASS_OBSERVATION/);
  assert.match(source, /SAMPLE_LIMIT=289/);
  assert.match(source, /INTERVAL_SECONDS=300/);
  assert.doesNotMatch(source, /shadow_verify|canonical_compat|transition_migration_control_v1/);
});

test("observer retains redacted evidence before bounded temporary cleanup", async () => {
  const source = await readFile(observerPath, "utf8");
  assert.match(source, /retain_evidence PASS_ACTIVATE_AND_OBSERVE[\s\S]*lease_release_observation[\s\S]*trap - ERR[\s\S]*cleanup_temporary_artifacts[\s\S]*echo "PASS_ACTIVATE_AND_OBSERVE"/);
  assert.match(source, /retain_evidence ROLLBACK_FAILED[\s\S]*exit 98/);
  assert.doesNotMatch(source, /production-runner\.sh" \|\| true/);
  assert.match(source, /rm -rf -- "\$\{OPS_ROOT\}" "\$\{SECURE_ROOT\}" "\$\{approved_staging\}"/);
  assert.doesNotMatch(source, /rm -rf -- "\$\{EVIDENCE_DIRECTORY\}"/);
});
