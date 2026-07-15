import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("entrypoint requires a transient systemd unit without a foreground fallback", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
    "utf8",
  );
  assert.match(source, /systemd-run/);
  assert.match(source, /Restart=no/);
  assert.match(source, /RuntimeMaxSec=5400/);
  assert.match(source, /StandardOutput=journal/);
  assert.match(source, /CANDIDATE_RUNTIME_IDENTITY_ENTRYPOINT_MODE=detached_worker/);
  assert.doesNotMatch(source, /foreground_fallback|nohup|disown/);
});

test("entrypoint cleans exact staging and credential roots and forwards termination", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
    "utf8",
  );
  assert.match(source, /cleanup_runtime_identity_packet/);
  assert.match(source, /rm -rf -- "\$\{ACTUAL_SOURCE_ROOT\}"/);
  assert.match(source, /rm -rf -- "\$\{APPROVED_SECURE_ROOT\}"/);
  assert.match(source, /rm -rf -- "\$\{APPROVED_OPS_ROOT\}"/);
  assert.match(source, /OPS_PARENT="\/home\/ubuntu\/\.cache\/market-radar-ops\/runtime-identity-ops"/);
  assert.doesNotMatch(source, /rm -rf -- "\$\{APPROVED_POSTGRES_ADMIN_ENV\}"/);
  assert.match(source, /trap cleanup_runtime_identity_packet EXIT/);
  assert.match(source, /forward_signal TERM 143/);
  assert.match(source, /forward_signal INT 130/);
  assert.match(source, /forward_signal HUP 129/);
});

test("entrypoint never prints credentials, passwords or database URLs", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
    "utf8",
  );
  assert.doesNotMatch(source, /cat\s+[^\n]*(credentials\.json|role-admin\.url)/);
  assert.doesNotMatch(source, /echo\s+[^\n]*(POSTGRES_PASSWORD|DATABASE_URL)/);
  assert.doesNotMatch(source, /\$POSTGRES_PASSWORD/);
  assert.match(source, /umask 077/);
  assert.match(source, /chmod 600/);
});

test("entrypoint binds the current root-only admin env and ignores the stale container password", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
    "utf8",
  );
  assert.match(source, /\.runtimeIdentityApproval\.postgresAdminEnvPath/);
  assert.match(source, /wp-g0-2-identity-runner-20260711T034847Z\/secrets\/postgres-admin\.env/);
  assert.match(source, /postgres_admin_env_not_regular/);
  assert.match(source, /postgres_admin_env_permissions_invalid/);
  assert.match(source, /sudo -n cat -- "\$\{APPROVED_POSTGRES_ADMIN_ENV\}"/);
  assert.match(source, /runner\.mjs prepare-secure-inputs/);
  assert.match(source, /'printf "%s\\000%s" "\$POSTGRES_USER" "\$POSTGRES_DB"'/);
});

test("entrypoint uses the current immutable Web image instead of requiring host Node", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
    "utf8",
  );
  assert.doesNotMatch(source, /command_name in [^\n]*\bnode\b/);
  assert.match(source, /com\.docker\.compose\.service=web/);
  assert.match(source, /WEB_IMAGE=.*inspect/);
  assert.match(source, /--network none --read-only --cap-drop ALL/);
  assert.match(source, /--security-opt no-new-privileges/);
  assert.match(source, /--entrypoint node "\$\{WEB_IMAGE\}"/);
  assert.match(source, /--runner \/packet\/scripts\/production\/candidate-runtime-identity\/runner\.mjs/);
});

test("production runner fences preflight, mutation, rollback and closeout with one external lease", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-runner.sh",
    "utf8",
  );
  for (const token of [
    "lease_acquire", "lease_consume", "lease_checkpoint dynamic-preflight",
    "lease_checkpoint provision-runtime-identities", "lease_safety_checkpoint rollback",
    "lease_outcome=\"ROLLBACK_PASS\"", "lease_release \"${lease_outcome}\"", "lease_release PASS",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(source.indexOf("runner.mjs preflight") < source.indexOf("runner.mjs provision"));
  assert.ok(source.indexOf("lease_consume") < source.lastIndexOf("runner.mjs provision"));
  assert.doesNotMatch(source, /--profile|--remove-orphans/);
  assert.match(source, /RUNTIME_IDENTITY_NODE_RUNTIME/);
  assert.match(source, /run_isolated_node/);
  assert.match(source, /--network none --read-only --cap-drop ALL/);
  assert.match(source, /web_runtime_changed_during_preflight/);
  assert.match(source, /--runner "\$\{RUNNER_MODULE\}"/);
  assert.doesNotMatch(source, /--runner "\$\{BASH_SOURCE\[0\]\}"/);
});

test("production runner reads GNU stat output before the BSD fallback", async () => {
  const source = await readFile(
    "scripts/production/candidate-runtime-identity/production-runner.sh",
    "utf8",
  );
  assert.match(source, /stat -c '%a' "\$1" 2>\/dev\/null \|\| stat -f '%Lp' "\$1"/);
  assert.match(source, /stat -c '%u' "\$1" 2>\/dev\/null \|\| stat -f '%u' "\$1"/);
  assert.match(source, /stat -c '%g' "\$1" 2>\/dev\/null \|\| stat -f '%g' "\$1"/);
  assert.doesNotMatch(source, /stat -f '%Lp' "\$1" 2>\/dev\/null \|\| stat -c '%a' "\$1"/);
});
