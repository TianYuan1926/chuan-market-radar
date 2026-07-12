import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  COMPOSE_WRAPPER_SHA256,
  IDENTITY_OVERRIDE_SHA256,
  PACKAGE_ID,
  PRODUCTION_COMPOSE_SHA256,
  PRODUCTION_HEAD,
  WebIdentityRecoveryPolicyError,
  loadContract,
  validateApprovalRequest,
  validateContract,
  validateLocalPreparation,
} from "./web-identity-recovery.mjs";

const execFileAsync = promisify(execFile);
const approvedWebImageId = `sha256:${"c".repeat(64)}`;

function throwsReason(reason, operation) {
  assert.throws(operation, (error) => error instanceof WebIdentityRecoveryPolicyError && error.reason === reason);
}

function buildRequest(contract, now = Date.now()) {
  return {
    approvalExpiresAt: new Date(now + 30 * 60_000).toISOString(),
    approvalIssuedAt: new Date(now - 60_000).toISOString(),
    approvalRef: "isolated-web-identity-recovery",
    automaticBaselineRollbackAllowed: true,
    baseEnvSha256: "d".repeat(64),
    composeSha256: contract.scope.productionComposeSha256,
    composeWrapperSha256: contract.scope.composeWrapperSha256,
    databaseMutationAllowed: false,
    execute: true,
    featureFlagMutationAllowed: false,
    identityOverrideSha256: contract.scope.identityOverrideSha256,
    migrationAllowed: false,
    noBuild: true,
    noSourceSync: true,
    operator: "isolated-rehearsal",
    packageId: contract.packageId,
    productionHead: contract.scope.productionHead,
    productionEnvSha256: "e".repeat(64),
    recoveryArtifactSha256: contract.artifact.sha256,
    redisMutationAllowed: false,
    service: "web",
    webImageId: approvedWebImageId,
    workerRestartAllowed: false,
  };
}

test("current recovery package passes local preparation without production authority", async () => {
  const result = await validateLocalPreparation();
  assert.equal(result.status, "PASS_LOCAL_WEB_IDENTITY_RECOVERY_PREPARATION");
  assert.equal(result.productionDecision, "BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifact.fileCount, 2);
  assert.equal(result.runner.webOnlyRecovery, true);
  assert.equal(result.runner.baselineRollback, true);
  assert.equal(result.runner.noOtherServiceMutation, true);
});

test("contract rejects scope expansion and stale production facts", async () => {
  const contract = await loadContract();
  const cases = [
    [{ productionAuthorization: true }, "production_authorization_must_be_false"],
    [{ scope: { ...contract.scope, service: "scanner-worker" } }, "service_not_web_only"],
    [{ scope: { ...contract.scope, buildAllowed: true } }, "build_must_be_false"],
    [{ scope: { ...contract.scope, sourceSyncAllowed: true } }, "source_sync_must_be_false"],
    [{ scope: { ...contract.scope, environmentFileChecksumsRequiredInApproval: false } }, "environment_checksum_binding_required"],
    [{ scope: { ...contract.scope, productionHead: "a".repeat(40) } }, "production_head_not_locked"],
    [{ scope: { ...contract.scope, identityOverrideSha256: "0".repeat(64) } }, "identity_override_checksum_not_locked"],
    [{ rollback: { ...contract.rollback, automaticRollbackRequired: false } }, "automatic_rollback_required"],
    [{ artifact: { ...contract.artifact, fileSha256: {} } }, "artifact_file_checksums_mismatch"],
  ];
  for (const [patch, reason] of cases) throwsReason(reason, () => validateContract({ ...contract, ...patch }));
});

test("approval is exact, time bounded and never authorizes adjacent mutations", async () => {
  const contract = await loadContract();
  const now = new Date("2026-07-13T02:00:00.000Z");
  const request = buildRequest(contract, now.getTime());
  assert.equal(validateApprovalRequest(request, contract, { now }), request);
  throwsReason("request_service_not_web_only", () => validateApprovalRequest({ ...request, service: "redis" }, contract, { now }));
  throwsReason("request_web_image_id_invalid", () => validateApprovalRequest({ ...request, webImageId: "latest" }, contract, { now }));
  throwsReason("request_base_env_checksum_invalid", () => validateApprovalRequest({ ...request, baseEnvSha256: "invalid" }, contract, { now }));
  throwsReason("request_recovery_artifact_checksum_mismatch", () => validateApprovalRequest({ ...request, recoveryArtifactSha256: "0".repeat(64) }, contract, { now }));
  throwsReason("databaseMutationAllowed_must_be_false", () => validateApprovalRequest({ ...request, databaseMutationAllowed: true }, contract, { now }));
  throwsReason("no_source_sync_must_be_true", () => validateApprovalRequest({ ...request, noSourceSync: false }, contract, { now }));
  throwsReason("approval_window_not_active", () => validateApprovalRequest(request, contract, { now: new Date(request.approvalExpiresAt).getTime() + 1 }));
});

test("runner source remains Web-only, no-build, no-source-sync and rollback-capable", async () => {
  const source = await readFile("scripts/production/web-identity-recovery.sh", "utf8");
  assert.match(source, /IDENTITY_COMPOSE\[@\][^\n]*up -d --no-deps --no-build --force-recreate web/);
  assert.match(source, /BASELINE_COMPOSE\[@\][^\n]*up -d --no-deps --no-build --force-recreate web/);
  assert.match(source, /trap rollback_on_failure EXIT/);
  assert.match(source, /PASS_PRODUCTION_WEB_IDENTITY_RECOVERY/);
  assert.doesNotMatch(source, /git\s+(?:-[^\s]+\s+)*(?:fetch|pull|merge|rebase|checkout)/);
  assert.doesNotMatch(source, /--remove-orphans|--profile/);
  assert.doesNotMatch(source, /migration:runner|candidate:migrate|persistence\/migrate/);
});

test("container-Node base64 validation enforces the same exact approval contract", async () => {
  const contract = await loadContract();
  const now = new Date("2026-07-13T02:00:00.000Z");
  const request = buildRequest(contract, now.getTime());
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
  const valid = await execFileAsync("node", [
    "scripts/production/web-identity-recovery.mjs", "request",
    "--request-base64", encode(request),
    "--contract-base64", encode(contract),
    "--now", now.toISOString(),
  ]);
  assert.match(valid.stdout, /"ok": true/);
  await assert.rejects(execFileAsync("node", [
    "scripts/production/web-identity-recovery.mjs", "request",
    "--request-base64", encode({ ...request, service: "redis" }),
    "--contract-base64", encode(contract),
    "--now", now.toISOString(),
  ]));
});

test("isolated execute changes only Web and restores the pre-recovery baseline on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-"));
  const fakeBin = join(directory, "bin");
  const root = join(directory, "production");
  const secure = join(directory, "secure");
  const stateFile = join(directory, "identity-state");
  const mutationLog = join(directory, "mutation.log");
  const requestFile = join(directory, "request.json");
  const wrapper = join(secure, "compose-identity-safe");
  const override = join(secure, "runtime-identity.override.yml");
  const contract = await loadContract();
  const request = buildRequest(contract);
  try {
    await mkdir(fakeBin, { recursive: true });
    await mkdir(root, { recursive: true });
    await mkdir(secure, { recursive: true });
    await writeFile(join(root, "docker-compose.yml"), "services:\n  web: {}\n");
    await writeFile(join(root, ".env"), "BASE=1\n", { mode: 0o600 });
    await writeFile(join(root, ".env.production"), "PRODUCTION=1\n", { mode: 0o600 });
    await writeFile(override, "services:\n  web:\n    environment:\n      DATABASE_URL: identity-url\n", { mode: 0o600 });
    await writeFile(requestFile, JSON.stringify(request), { mode: 0o600 });
    await writeFile(stateFile, "baseline\n");
    await writeFile(mutationLog, "");

    await writeFile(wrapper, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2).join(' ');",
      "if (args === 'config --format json') { console.log(JSON.stringify({ services: { web: { environment: { DATABASE_URL: 'identity-url' } } } })); process.exit(0); }",
      "if (args === 'ps -q web') { console.log(fs.readFileSync(process.env.FAKE_STATE, 'utf8').trim() === 'identity' ? 'web-new' : 'web-old'); process.exit(0); }",
      "if (args === 'up -d --no-deps --no-build --force-recreate web') { fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'identity:web\\n'); fs.writeFileSync(process.env.FAKE_STATE, 'identity\\n'); process.exit(0); }",
      "process.exit(1);",
      "",
    ].join("\n"), { mode: 0o700 });

    const fakeGit = [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "const command = args[0] === '-C' ? args.slice(2) : args;",
      `if (command[0] === 'rev-parse') { console.log('${PRODUCTION_HEAD}'); process.exit(0); }`,
      "if (command[0] === 'branch') { console.log('main'); process.exit(0); }",
      "if (command[0] === 'status') process.exit(0);",
      "process.exit(1);",
      "",
    ].join("\n");
    const fakeDocker = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const crypto = require('node:crypto');",
      "const args = process.argv.slice(2); const joined = args.join(' '); const mode = fs.readFileSync(process.env.FAKE_STATE, 'utf8').trim();",
      "if (args[0] === 'ps') {",
      "  if (joined.includes('chuan-market-radar-web-1')) console.log(mode === 'identity' ? 'web-new' : 'web-old');",
      "  else if (joined.includes('chuan-market-radar-postgres-1')) console.log('pg');",
      "  else if (joined.includes('{{.Names}}={{.ID}}')) { console.log(`chuan-market-radar-web-1=${mode === 'identity' ? 'web-new' : 'web-old'}\\nchuan-market-radar-postgres-1=pg\\nchuan-market-radar-redis-1=redis\\nchuan-market-radar-scanner-worker-1=scanner`); }",
      "  else if (joined.includes('{{.Names}}')) console.log('chuan-market-radar-web-1\\nchuan-market-radar-postgres-1\\nchuan-market-radar-redis-1\\nchuan-market-radar-scanner-worker-1');",
      "  process.exit(0);",
      "}",
      `if (args[0] === 'inspect' && joined.includes('{{.Image}}')) { console.log('${approvedWebImageId}'); process.exit(0); }`,
      "if (args[0] === 'inspect' && joined.includes('{{.Name}}')) { console.log('/chuan-market-radar-web-1'); process.exit(0); }",
      "if (args[0] === 'compose' && joined.includes('up -d --no-deps --no-build --force-recreate web')) { fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'baseline:web\\n'); fs.writeFileSync(process.env.FAKE_STATE, 'baseline\\n'); process.exit(0); }",
      "if (args[0] === 'exec') {",
      "  if (joined.includes('pg_isready')) process.exit(0);",
      "  if (joined.includes('redis-cli ping')) { console.log('PONG'); process.exit(0); }",
      "  if (joined.includes('psql')) { fs.readFileSync(0, 'utf8'); console.log('1'); process.exit(0); }",
      "  if (joined.includes('sha256sum')) { const value = mode === 'identity' ? 'identity-url' : 'baseline-url'; console.log(crypto.createHash('sha256').update(value).digest('hex') + '  -'); process.exit(0); }",
      "  if (joined.includes('node --input-type=module - request')) { fs.readFileSync(0, 'utf8'); process.exit(0); }",
      "  if (joined.includes('node -')) { fs.readFileSync(0, 'utf8'); process.exit(0); }",
      "}",
      "process.exit(1);",
      "",
    ].join("\n");
    const fakeSudo = "#!/bin/sh\n[ \"$1\" = \"-n\" ] && shift\nexec \"$@\"\n";
    const fakeStat = [
      "#!/bin/sh",
      "format=$2; file=$3",
      "case \"$format:$file\" in",
      `  %a:${requestFile}|%a:${override}) echo 600 ;;`,
      `  %a:${wrapper}) echo 700 ;;`,
      `  %u:${override}|%u:${wrapper}) echo 0 ;;`,
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n");
    const fakeSha = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const crypto = require('node:crypto'); const file = process.argv[2];",
      `if (file === ${JSON.stringify(override)}) { console.log('${IDENTITY_OVERRIDE_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(wrapper)}) { console.log('${COMPOSE_WRAPPER_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, "docker-compose.yml"))}) { console.log('${PRODUCTION_COMPOSE_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env"))}) { console.log('${"d".repeat(64)}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env.production"))}) { console.log('${"e".repeat(64)}  ' + file); process.exit(0); }`,
      "if (file) { console.log(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + '  ' + file); process.exit(0); }",
      "let source=''; process.stdin.on('data', c => source += c); process.stdin.on('end', () => console.log(crypto.createHash('sha256').update(source).digest('hex') + '  -'));",
      "",
    ].join("\n");
    const fakeCurl = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const args = process.argv.slice(2); const url = args[args.length - 1]; const mode = fs.readFileSync(process.env.FAKE_STATE, 'utf8').trim();",
      "if (url.endsWith('/api/health')) {",
      "  const ready = mode === 'identity' && process.env.FAKE_HEALTH_FAIL !== '1';",
      "  console.log(JSON.stringify({ ok: true, health: { level: ready ? 'ready' : 'degraded', scan: { freshness: 'fresh' }, persistence: { databaseStatus: 'ready', detail: ready ? 'repository reads ready' : 'storage unavailable: password authentication failed' } } })); process.exit(0);",
      "}",
      "console.log(JSON.stringify({ ok: true }));",
      "",
    ].join("\n");
    for (const [name, source] of [["git", fakeGit], ["docker", fakeDocker], ["sudo", fakeSudo], ["stat", fakeStat], ["sha256sum", fakeSha], ["curl", fakeCurl]]) {
      await writeFile(join(fakeBin, name), source);
      await chmod(join(fakeBin, name), 0o755);
    }
    await chmod(wrapper, 0o700);

    const env = {
      ...process.env,
      BASE_ENV_FILE: join(root, ".env"),
      BASE_URL: "http://127.0.0.1",
      CONFIRM_WEB_IDENTITY_RECOVERY: "true",
      ENV_FILE: join(root, ".env.production"),
      FAKE_MUTATION_LOG: mutationLog,
      FAKE_STATE: stateFile,
      IDENTITY_OVERRIDE_FILE: override,
      IDENTITY_WRAPPER: wrapper,
      PATH: `${fakeBin}:${process.env.PATH}`,
      REQUEST_FILE: requestFile,
      ROOT_DIR_OVERRIDE: root,
      WEB_IDENTITY_RECOVERY_MODE: "production_recovery",
      WEB_READY_POLL_SECONDS: "0",
      WEB_READY_TIMEOUT_SECONDS: "0",
    };
    const run = (extra = {}) => execFileAsync("/bin/bash", ["scripts/production/web-identity-recovery.sh"], {
      cwd: process.cwd(),
      env: { ...env, ...extra },
      maxBuffer: 2 * 1024 * 1024,
    });

    const success = await run();
    assert.match(success.stdout, /PASS_PRODUCTION_WEB_IDENTITY_RECOVERY/);
    assert.equal((await readFile(stateFile, "utf8")).trim(), "identity");
    assert.equal((await readFile(mutationLog, "utf8")).trim(), "identity:web");

    await writeFile(stateFile, "baseline\n");
    await writeFile(mutationLog, "");
    const containerValidatorSuccess = await run({ WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR: "true" });
    assert.match(containerValidatorSuccess.stdout, /PASS_PRODUCTION_WEB_IDENTITY_RECOVERY/);
    assert.equal((await readFile(stateFile, "utf8")).trim(), "identity");
    assert.equal((await readFile(mutationLog, "utf8")).trim(), "identity:web");

    await writeFile(stateFile, "baseline\n");
    await writeFile(mutationLog, "");
    await assert.rejects(run({ FAKE_HEALTH_FAIL: "1" }));
    assert.equal((await readFile(stateFile, "utf8")).trim(), "baseline");
    assert.equal((await readFile(mutationLog, "utf8")).trim(), "identity:web\nbaseline:web");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("locked production facts match the dedicated recovery package", () => {
  assert.equal(PACKAGE_ID, "WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY");
  assert.equal(PRODUCTION_HEAD.length, 40);
  assert.equal(IDENTITY_OVERRIDE_SHA256.length, 64);
  assert.equal(COMPOSE_WRAPPER_SHA256.length, 64);
  assert.equal(PRODUCTION_COMPOSE_SHA256.length, 64);
});
