import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
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
  sha256,
  validateApprovalRequest,
  validateContract,
  validateLocalPreparation,
} from "./web-identity-recovery.mjs";
import { buildTransportBundle } from "./web-identity-recovery-bundle.mjs";

const execFileAsync = promisify(execFile);
const approvedWebImageId = `sha256:${"c".repeat(64)}`;

function throwsReason(reason, operation) {
  assert.throws(operation, (error) => error instanceof WebIdentityRecoveryPolicyError && error.reason === reason);
}

function buildRequest(contract, now = Date.now(), overrides = {}) {
  return {
    approvalExpiresAt: new Date(now + 30 * 60_000).toISOString(),
    approvalIssuedAt: new Date(now - 60_000).toISOString(),
    approvalRef: "isolated-web-identity-recovery",
    automaticBaselineRollbackAllowed: true,
    baseEnvSha256: "d".repeat(64),
    composeSha256: contract.scope.productionComposeSha256,
    composeWrapperSha256: contract.scope.composeWrapperSha256,
    contractSha256: "f".repeat(64),
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
    productionRepositoryMutationAllowed: false,
    recoveryArtifactSha256: contract.artifact.sha256,
    redisMutationAllowed: false,
    runnerSourceCommit: "a".repeat(40),
    service: "web",
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-web-identity-recovery-isolated",
    temporaryArtifactCleanupRequired: true,
    temporaryArtifactStagingAllowed: true,
    transportBundleSha256: "b".repeat(64),
    transportMethod: "approved_orcaterm_bundle_upload",
    webImageId: approvedWebImageId,
    workerRestartAllowed: false,
    ...overrides,
  };
}

test("current recovery package passes local preparation without production authority", async () => {
  const result = await validateLocalPreparation();
  assert.equal(result.status, "PASS_LOCAL_WEB_IDENTITY_RECOVERY_PREPARATION");
  assert.equal(result.productionDecision, "BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifact.fileCount, 3);
  assert.equal(result.runner.webOnlyRecovery, true);
  assert.equal(result.runner.baselineRollback, true);
  assert.equal(result.runner.noOtherServiceMutation, true);
  assert.equal(result.runner.persistenceRecoveryBarrier, true);
  assert.equal(result.runner.explicitPartialResult, true);
});

test("contract rejects scope expansion and stale production facts", async () => {
  const contract = await loadContract();
  const cases = [
    [{ productionAuthorization: true }, "production_authorization_must_be_false"],
    [{ scope: { ...contract.scope, service: "scanner-worker" } }, "service_not_web_only"],
    [{ scope: { ...contract.scope, buildAllowed: true } }, "build_must_be_false"],
    [{ scope: { ...contract.scope, sourceSyncAllowed: true } }, "source_sync_must_be_false"],
    [{ scope: { ...contract.scope, temporaryArtifactStagingAllowed: false } }, "temporary_artifact_staging_required"],
    [{ scope: { ...contract.scope, productionRepositoryMutationAllowed: true } }, "production_repository_mutation_must_be_false"],
    [{ scope: { ...contract.scope, temporaryArtifactCleanupRequired: false } }, "temporary_artifact_cleanup_required"],
    [{ scope: { ...contract.scope, environmentFileChecksumsRequiredInApproval: false } }, "environment_checksum_binding_required"],
    [{ scope: { ...contract.scope, productionHead: "a".repeat(40) } }, "production_head_not_locked"],
    [{ scope: { ...contract.scope, identityOverrideSha256: "0".repeat(64) } }, "identity_override_checksum_not_locked"],
    [{ transport: { ...contract.transport, reproducibleArchiveRequired: false } }, "reproducible_archive_required"],
    [{ transport: { ...contract.transport, archiveFormat: "tar-gzip-default" } }, "transport_archive_format_not_locked"],
    [{ transport: { ...contract.transport, sourceDateEpoch: Date.now() } }, "transport_source_date_epoch_not_locked"],
    [{ rollback: { ...contract.rollback, automaticRollbackRequired: false } }, "automatic_rollback_required"],
    [{ rollback: { ...contract.rollback, rollbackOnlyBeforePersistenceRecoveryVerified: false } }, "rollback_boundary_not_locked"],
    [{ rollback: { ...contract.rollback, retainRecoveredIdentityOnIndependentScanDegradation: false } }, "recovered_identity_retention_not_locked"],
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
  throwsReason("request_staging_directory_invalid", () => validateApprovalRequest({ ...request, stagingDirectory: "/home/ubuntu/apps/chuan-market-radar" }, contract, { now }));
  throwsReason("request_transport_method_invalid", () => validateApprovalRequest({ ...request, transportMethod: "git_pull" }, contract, { now }));
  throwsReason("production_repository_mutation_not_forbidden", () => validateApprovalRequest({ ...request, productionRepositoryMutationAllowed: true }, contract, { now }));
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
  const entrypoint = await readFile("scripts/production/web-identity-recovery-entrypoint.sh", "utf8");
  assert.match(entrypoint, /trap cleanup_staging EXIT/);
  assert.match(entrypoint, /trap 'exit 130' INT/);
  assert.match(entrypoint, /trap 'exit 143' TERM/);
  assert.match(entrypoint, /APPROVED_STAGING_DIRECTORY/);
  assert.doesNotMatch(entrypoint, /git\s+(?:-[^\s]+\s+)*(?:fetch|pull|merge|rebase|checkout)/);
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
  const stage = join(directory, "wp-g0-2-web-identity-recovery-isolated");
  const secure = join(directory, "secure");
  const stateFile = join(directory, "identity-state");
  const mutationLog = join(directory, "mutation.log");
  const requestFile = join(stage, "approval-request.json");
  const wrapper = join(secure, "compose-identity-safe");
  const override = join(secure, "runtime-identity.override.yml");
  const contract = await loadContract();
  try {
    await mkdir(fakeBin, { recursive: true });
    await mkdir(root, { recursive: true });
    await mkdir(secure, { recursive: true });
    await mkdir(join(stage, "scripts/production"), { recursive: true });
    await mkdir(join(stage, "docs/governance"), { recursive: true });
    await chmod(stage, 0o700);
    for (const file of [
      "scripts/production/web-identity-recovery-entrypoint.sh",
      "scripts/production/web-identity-recovery.mjs",
      "scripts/production/web-identity-recovery.sh",
      "docs/governance/wp-g0-2-production-web-identity-recovery.v1.json",
    ]) {
      await copyFile(file, join(stage, file));
    }
    const stagedContractBytes = await readFile(join(stage, "docs/governance/wp-g0-2-production-web-identity-recovery.v1.json"));
    const stageReal = await realpath(stage);
    const request = buildRequest(contract, Date.now(), {
      contractSha256: sha256(stagedContractBytes),
      stagingDirectory: stageReal,
    });
    await writeFile(join(stage, "transport-manifest.json"), JSON.stringify({
      sourceCommit: request.runnerSourceCommit,
      approvalEligible: true,
      contractSha256: request.contractSha256,
      transportMethod: request.transportMethod,
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      sourceDateEpoch: 946684800,
      containsSecrets: false,
      productionRepositoryMutationAllowed: false,
    }), { mode: 0o600 });
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
      "  const persistenceReady = mode === 'identity' && process.env.FAKE_HEALTH_FAIL !== '1';",
      "  const scanFresh = persistenceReady && process.env.FAKE_SCAN_AGING !== '1';",
      "  console.log(JSON.stringify({ ok: true, health: { level: scanFresh ? 'ready' : 'degraded', scan: { freshness: scanFresh ? 'fresh' : 'aging' }, persistence: { databaseStatus: 'ready', detail: persistenceReady ? 'repository reads ready' : 'storage unavailable: password authentication failed' } } })); process.exit(0);",
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
      WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR: "true",
      WEB_READY_POLL_SECONDS: "0",
      WEB_READY_TIMEOUT_SECONDS: "0",
      FULL_HEALTH_TIMEOUT_SECONDS: "0",
      FULL_HEALTH_POLL_SECONDS: "0",
    };
    const run = (extra = {}) => execFileAsync("/bin/bash", [join(stage, "scripts/production/web-identity-recovery.sh")], {
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
    await assert.rejects(run({ FAKE_SCAN_AGING: "1" }), (error) => {
      assert.match(error.stderr, /PARTIAL_PRODUCTION_WEB_IDENTITY_RECOVERY_SCAN_NOT_FRESH/);
      return true;
    });
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
  assert.equal(IDENTITY_OVERRIDE_SHA256, "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a1545a16892816cdbc478bacf");
  assert.equal(COMPOSE_WRAPPER_SHA256, "fb473dc3bf0a2968be8ad385efac3273f4057530df17cee73f2003d3a369f1f3");
  assert.notEqual(IDENTITY_OVERRIDE_SHA256, "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a15a5a16892816cdcb478bacf");
  assert.notEqual(COMPOSE_WRAPPER_SHA256, "fb473dc3bf0a2968be8bad385efac32734f0575ddf17cee73f2003d3a369f1f3");
  assert.equal(PRODUCTION_COMPOSE_SHA256.length, 64);
});

test("prior manually transcribed identity fingerprints stay rejected", async () => {
  const contract = await loadContract();
  throwsReason("identity_override_checksum_not_locked", () => validateContract({
    ...contract,
    scope: {
      ...contract.scope,
      identityOverrideSha256: "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a15a5a16892816cdcb478bacf",
    },
  }));
  throwsReason("compose_wrapper_checksum_not_locked", () => validateContract({
    ...contract,
    scope: {
      ...contract.scope,
      composeWrapperSha256: "fb473dc3bf0a2968be8bad385efac32734f0575ddf17cee73f2003d3a369f1f3",
    },
  }));
});

test("transport bundle contains only the approved secret-free recovery payload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-transport-"));
  const output = join(directory, "recovery.tar.gz");
  const extract = join(directory, "extract");
  try {
    const result = await buildTransportBundle({ root: process.cwd(), output, sourceCommit: "a".repeat(40) });
    assert.equal(result.status, "PASS_FINAL_RECOVERY_TRANSPORT_BUNDLE");
    assert.equal(result.manifest.reproducibleArchive, true);
    assert.equal(result.manifest.archiveFormat, "ustar+gzip-n");
    assert.equal(result.manifest.sourceDateEpoch, 946684800);
    assert.equal(result.manifest.containsSecrets, false);
    assert.equal(result.manifest.productionRepositoryMutationAllowed, false);
    await mkdir(extract);
    await execFileAsync("tar", ["-xzf", output, "-C", extract]);
    const expected = [
      "docs/governance/wp-g0-2-production-web-identity-recovery.v1.json",
      "scripts/production/web-identity-recovery-entrypoint.sh",
      "scripts/production/web-identity-recovery.mjs",
      "scripts/production/web-identity-recovery.sh",
      "transport-manifest.json",
    ];
    const { stdout } = await execFileAsync("tar", ["-tzf", output]);
    const actual = stdout.split("\n").filter((line) => line && !line.endsWith("/")).map((line) => line.replace(/^\.\//, "")).sort();
    assert.deepEqual(actual, expected.sort());
    assert.equal((await stat(join(extract, "transport-manifest.json"))).isFile(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transport bundle is byte-for-byte reproducible for the same committed payload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-reproducible-"));
  try {
    const first = await buildTransportBundle({
      root: process.cwd(),
      output: join(directory, "first.tar.gz"),
      sourceCommit: "a".repeat(40),
    });
    const second = await buildTransportBundle({
      root: process.cwd(),
      output: join(directory, "second.tar.gz"),
      sourceCommit: "a".repeat(40),
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.output), await readFile(second.output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dirty preparation can only create a non-approvable transport template", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-template-"));
  const output = join(directory, "template.tar.gz");
  try {
    const result = await buildTransportBundle({
      root: process.cwd(),
      output,
      sourceCommit: null,
      approvalEligible: false,
    });
    assert.equal(result.status, "PASS_LOCAL_RECOVERY_TRANSPORT_BUNDLE_TEMPLATE");
    assert.equal(result.manifest.approvalEligible, false);
    assert.equal(result.manifest.sourceCommit, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("approved entrypoint removes temporary staging after child success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-entrypoint-"));
  const stage = join(directory, "wp-g0-2-web-identity-recovery-cleanup");
  try {
    await mkdir(join(stage, "scripts/production"), { recursive: true });
    await chmod(stage, 0o700);
    await copyFile("scripts/production/web-identity-recovery-entrypoint.sh", join(stage, "scripts/production/web-identity-recovery-entrypoint.sh"));
    await writeFile(join(stage, "scripts/production/web-identity-recovery.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const bundleSha = "b".repeat(64);
    await writeFile(join(stage, "approval-request.json"), JSON.stringify({
      stagingDirectory: await realpath(stage),
      transportBundleSha256: bundleSha,
    }), { mode: 0o600 });
    await writeFile(join(stage, ".transport-bundle.sha256"), `${bundleSha}\n`, { mode: 0o600 });
    await execFileAsync("/bin/bash", [join(stage, "scripts/production/web-identity-recovery-entrypoint.sh")]);
    await assert.rejects(stat(stage));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("entrypoint preserves nonzero SIGTERM status and still removes staging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-identity-recovery-signal-"));
  const stage = join(directory, "wp-g0-2-web-identity-recovery-signal");
  try {
    await mkdir(join(stage, "scripts/production"), { recursive: true });
    await chmod(stage, 0o700);
    await copyFile("scripts/production/web-identity-recovery-entrypoint.sh", join(stage, "scripts/production/web-identity-recovery-entrypoint.sh"));
    await writeFile(join(stage, "scripts/production/web-identity-recovery.sh"), "#!/bin/sh\nsleep 0.2\n", { mode: 0o700 });
    const bundleSha = "b".repeat(64);
    await writeFile(join(stage, "approval-request.json"), JSON.stringify({
      stagingDirectory: await realpath(stage),
      transportBundleSha256: bundleSha,
    }), { mode: 0o600 });
    await writeFile(join(stage, ".transport-bundle.sha256"), `${bundleSha}\n`, { mode: 0o600 });
    const child = spawn("/bin/bash", [join(stage, "scripts/production/web-identity-recovery-entrypoint.sh")]);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await stat(join(stage, ".entrypoint-ready"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    assert.equal((await stat(join(stage, ".entrypoint-ready"))).isFile(), true);
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");
    assert.equal(code, 143);
    assert.equal(signal, null);
    await assert.rejects(stat(stage));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
