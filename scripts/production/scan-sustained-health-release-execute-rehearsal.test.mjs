import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  BASELINE_COMMIT,
  COMPOSE_WRAPPER_SHA256,
  CONTRACT_PATH,
  IDENTITY_OVERRIDE_SHA256,
  PACKAGE_ID,
  PRODUCTION_COMPOSE_SHA256,
  RELEASE_DIFF_LINES,
  RELEASE_DIFF_SHA256,
  TARGET_COMMIT,
  TARGET_REMOTE_BRANCH,
  loadContract,
  productionPreflightSha256,
  rollbackEvidenceSha256,
  sha256,
} from "./scan-sustained-health-release.mjs";

const execFileAsync = promisify(execFile);
const OLD_WEB_IMAGE = `sha256:${"1".repeat(64)}`;
const OLD_SCANNER_IMAGE = `sha256:${"2".repeat(64)}`;
const NEW_WEB_IMAGE = `sha256:${"3".repeat(64)}`;
const NEW_SCANNER_IMAGE = `sha256:${"4".repeat(64)}`;

function rollbackImageRef(service, imageId) {
  return `market-radar-rollback/wp-g0-2-scan-health:${service}-${imageId.slice(7, 23)}`;
}

async function writeExecutable(path, source) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

test("isolated execute proves success and restores both images plus main on observation failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-sustained-health-execute-"));
  const fakeBin = join(directory, "bin");
  const root = join(directory, "production");
  const stage = join(directory, "wp-g0-2-scan-sustained-health-release-rehearsal1");
  const secure = join(directory, "secure");
  const stateFile = join(directory, "state.json");
  const mutationLog = join(directory, "mutation.log");
  const curlCountFile = join(directory, "curl-count");
  const clockFile = join(directory, "clock");
  const requestFile = join(stage, "approval-request.json");
  const wrapper = join(secure, "compose-identity-safe");
  const override = join(secure, "runtime-identity.override.yml");
  const realJq = (await execFileAsync("sh", ["-lc", "command -v jq"])).stdout.trim();
  const contract = await loadContract();

  try {
    await mkdir(fakeBin, { recursive: true });
    await mkdir(root, { recursive: true });
    await mkdir(secure, { recursive: true });
    await mkdir(join(stage, "scripts/production"), { recursive: true });
    await mkdir(join(stage, "docs/governance"), { recursive: true });
    for (const file of [
      "scripts/governance/autonomy-production-lease-cli.mjs",
      "scripts/governance/autonomy-production-lease.mjs",
      "scripts/governance/autonomy-policy.mjs",
      "scripts/production/scan-sustained-health-release-entrypoint.sh",
      "scripts/production/scan-sustained-health-release.mjs",
      "scripts/production/scan-sustained-health-release.sh",
      CONTRACT_PATH,
    ]) {
      await mkdir(dirname(join(stage, file)), { recursive: true });
      await copyFile(file, join(stage, file));
    }
    await writeFile(join(root, "docker-compose.yml"), "compose-approved\n");
    await writeFile(join(root, ".env"), "BASE=redacted\n", { mode: 0o600 });
    await writeFile(join(root, ".env.production"), "PRODUCTION=redacted\n", { mode: 0o600 });
    await writeFile(override, "services:\n  web: {}\n", { mode: 0o600 });
    await writeFile(stateFile, JSON.stringify({
      git: "baseline", web: "old", scanner: "old", retainedWeb: false, retainedScanner: false,
    }));
    await writeFile(mutationLog, "");
    await writeFile(curlCountFile, "0");
    await writeFile(clockFile, "0");

    const identityUrlHash = createHash("sha256").update("identity-url").digest("hex");
    const stagedContract = await readFile(join(stage, CONTRACT_PATH));
    const now = Date.now();
    const request = {
      approvalExpiresAt: new Date(now + 89 * 60 * 1000).toISOString(),
      approvalIssuedAt: new Date(now - 30 * 1000).toISOString(),
      approvalRef: "isolated-release-rehearsal",
      automaticRollbackAllowed: true,
      baseEnvSha256: "5".repeat(64),
      baselineCommit: BASELINE_COMMIT,
      buildAllowed: true,
      cadenceSeconds: 900,
      candidateRuntimeMutationAllowed: false,
      composeSha256: PRODUCTION_COMPOSE_SHA256,
      composeWrapperSha256: COMPOSE_WRAPPER_SHA256,
      contractSha256: sha256(stagedContract),
      databaseMutationAllowed: false,
      detachedHeadAfterSuccess: true,
      environmentMutationAllowed: false,
      evidenceDirectory: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-scan-sustained-health-rehearsal1",
      execute: true,
      featureFlagMutationAllowed: false,
      identityOverrideSha256: IDENTITY_OVERRIDE_SHA256,
      migrationAllowed: false,
      observationDurationSeconds: 1800,
      operator: "codex",
      otherServiceRestartAllowed: false,
      packageId: PACKAGE_ID,
      productionEnvSha256: "6".repeat(64),
      productionRepositoryMutationAllowed: true,
      redisMutationAllowed: false,
      releaseArtifactSha256: contract.artifact.sha256,
      releaseDiffSha256: RELEASE_DIFF_SHA256,
      requiredCompletionAdvances: 2,
      rollbackImageRetentionRequired: true,
      rollbackScannerWorkerImageRef: rollbackImageRef("scanner-worker", OLD_SCANNER_IMAGE),
      rollbackWebImageRef: rollbackImageRef("web", OLD_WEB_IMAGE),
      runnerUnitName: "market-radar-scan-health-rehearsal1",
      runnerSourceCommit: "7".repeat(40),
      scannerWorkerImageId: OLD_SCANNER_IMAGE,
      sessionIndependentExecutionRequired: true,
      services: ["web", "scanner-worker"],
      sourceFetchAllowed: true,
      stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-scan-sustained-health-release-rehearsal1",
      targetCommit: TARGET_COMMIT,
      targetRemoteBranch: TARGET_REMOTE_BRANCH,
      temporaryArtifactCleanupRequired: true,
      transportBundleSha256: "8".repeat(64),
      transportMethod: "approved_orcaterm_bundle_upload",
      webImageId: OLD_WEB_IMAGE,
    };
    request.autonomyTrustRoot = "/home/ubuntu/.local/state/market-radar-autonomy";
    request.autonomyAuthorization = {
      schemaVersion: "market-radar-package-authorization.v1",
      mode: "g0_g8_standing_user_grant",
      approvedBy: "user_standing_grant",
      grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
      approvalId: "scan-health-rehearsal-approval-1",
      nonce: "scan-health-rehearsal-nonce-1",
      gate: "G0",
      packageId: PACKAGE_ID,
      scope: PACKAGE_ID,
      actionClass: "reversible_service_release",
      riskTier: "R1_REVERSIBLE_RUNTIME",
      builderAgentId: "codex-primary",
      baseCommit: "0".repeat(40),
      targetCommit: request.runnerSourceCommit,
      targetTree: "1".repeat(40),
      diffSha256: "2".repeat(64),
      pathSetSha256: "3".repeat(64),
      contractSha256: request.contractSha256,
      runnerSha256: contract.artifact.fileSha256["scripts/production/scan-sustained-health-release.sh"],
      artifactSha256: contract.artifact.sha256,
      imageOrMigrationSha256: sha256(`${request.webImageId}\n${request.scannerWorkerImageId}\n`),
      composeSha256: request.composeSha256,
      environmentFingerprintSha256: sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
      productionIdentitySha256: sha256(`${request.identityOverrideSha256}\n${request.composeWrapperSha256}\n`),
      gateEvidenceSha256: "4".repeat(64),
      preflightSha256: productionPreflightSha256(request),
      backupRestoreEvidenceSha256: rollbackEvidenceSha256(request),
      rollbackTarget: `${BASELINE_COMMIT}:web+scanner-worker`,
      observationContractSha256: sha256(JSON.stringify(contract.observation)),
      policySha256: contract.artifact.fileSha256["scripts/governance/autonomy-policy.mjs"],
      revocationEpoch: 2,
      issuedAt: request.approvalIssuedAt,
      expiresAt: request.approvalExpiresAt,
      maxExecutions: 1,
      packageAssertions: {
        qualityThresholdChanged: false,
        scopeMatchesBlueprint: true,
        dynamicPreflightCurrent: true,
        requiredGatesPassed: true,
        rollbackVerified: true,
        productionWipAvailable: true,
        secretsPresentInEvidence: false,
        knownP0Open: false,
        pollutionCleanupManifestExact: true,
      },
    };
    await writeFile(requestFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
    await writeFile(join(stage, "transport-manifest.json"), `${JSON.stringify({
      sourceCommit: request.runnerSourceCommit,
      sourceTree: request.autonomyAuthorization.targetTree,
      sourceParentCommit: request.autonomyAuthorization.baseCommit,
      sourceDiffSha256: request.autonomyAuthorization.diffSha256,
      sourcePathSetSha256: request.autonomyAuthorization.pathSetSha256,
      gateEvidenceSha256: request.autonomyAuthorization.gateEvidenceSha256,
      policySha256: request.autonomyAuthorization.policySha256,
      targetCommit: TARGET_COMMIT,
      approvalEligible: true,
      contractSha256: request.contractSha256,
      transportMethod: request.transportMethod,
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      sourceDateEpoch: 946684800,
      containsSecrets: false,
      executionMode: "transient_systemd_unit",
      sessionIndependentExecutionRequired: true,
      runnerLogs: "journald",
      rollbackImageRetentionRequired: true,
      rollbackRetentionRepository: "market-radar-rollback/wp-g0-2-scan-health",
      rollbackCleanupRequiresSeparateApproval: true,
      productionRepositoryMutationAllowed: true,
    })}\n`, { mode: 0o600 });

    await writeExecutable(wrapper, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2).join(' ');",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      "if (args === 'config --format json') { console.log(JSON.stringify({ services: { web: { environment: { DATABASE_URL: 'identity-url' } }, 'scanner-worker': { environment: { DATABASE_URL: 'identity-url' } } } })); process.exit(0); }",
      "if (args === 'ps -q web') { console.log(state.web === 'new' ? 'web-new-id' : 'web-old-id'); process.exit(0); }",
      "if (args === 'ps -q scanner-worker') { console.log(state.scanner === 'new' ? 'scanner-new-id' : 'scanner-old-id'); process.exit(0); }",
      "if (args === 'build web scanner-worker') { if (!state.retainedWeb || !state.retainedScanner) process.exit(9); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'build:web,scanner-worker\\n'); process.exit(0); }",
      "if (args === 'up -d --no-deps --no-build --force-recreate web') { state.web = state.git === 'target' ? 'new' : 'old'; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `up:web:${state.web}\\n`); process.exit(0); }",
      "if (args === 'up -d --no-deps --no-build --force-recreate scanner-worker') { state.scanner = state.git === 'target' ? 'new' : 'old'; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `up:scanner-worker:${state.scanner}\\n`); process.exit(0); }",
      "process.exit(1);",
      "",
    ].join("\n"));

    await writeExecutable(join(fakeBin, "git"), [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2); const command = args[0] === '-C' ? args.slice(2) : args;",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      `if (command[0] === 'rev-parse' && command[1] === 'HEAD') { console.log(state.git === 'target' ? '${TARGET_COMMIT}' : '${BASELINE_COMMIT}'); process.exit(0); }`,
      `if (command[0] === 'rev-parse' && command[1].includes('refs/remotes/origin')) { console.log('${TARGET_COMMIT}'); process.exit(0); }`,
      "if (command[0] === 'branch' && command[1] === '--show-current') { if (state.git === 'baseline') console.log('main'); process.exit(0); }",
      "if (command[0] === 'status') process.exit(0);",
      "if (command[0] === 'fetch') { fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'fetch:exact-release\\n'); process.exit(0); }",
      `if (command[0] === 'rev-list') { console.log('${TARGET_COMMIT} ${BASELINE_COMMIT}'); process.exit(0); }`,
      `if (command[0] === 'diff-tree') { console.log(${JSON.stringify(RELEASE_DIFF_LINES.join("\n"))}); process.exit(0); }`,
      "if (command[0] === 'show') { console.log('compose-approved'); process.exit(0); }",
      "if (command[0] === 'checkout' && command[1] === '--detach') { state.git = 'target'; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'checkout:target\\n'); process.exit(0); }",
      "if (command[0] === 'checkout' && command[1] === 'main') { state.git = 'baseline'; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'checkout:main\\n'); process.exit(0); }",
      "process.exit(1);",
      "",
    ].join("\n"));

    await writeExecutable(join(fakeBin, "docker"), [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const crypto = require('node:crypto');",
      "const args = process.argv.slice(2); const joined = args.join(' '); const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      "const webId = state.web === 'new' ? 'web-new-id' : 'web-old-id'; const scannerId = state.scanner === 'new' ? 'scanner-new-id' : 'scanner-old-id';",
      "if (args[0] === 'ps') {",
      "  if (joined.includes('chuan-market-radar-web-1')) console.log(webId);",
      "  else if (joined.includes('chuan-market-radar-scanner-worker-1')) console.log(scannerId);",
      "  else if (joined.includes('chuan-market-radar-postgres-1')) console.log('postgres-id');",
      "  else if (joined.includes('{{.Names}}={{.ID}}')) console.log(`chuan-market-radar-web-1=${webId}\\nchuan-market-radar-scanner-worker-1=${scannerId}\\nchuan-market-radar-postgres-1=postgres-id\\nchuan-market-radar-redis-1=redis-id\\nchuan-market-radar-caddy-1=caddy-id\\nchuan-market-radar-signal-worker-1=signal-id`);",
      "  else if (joined.includes('{{.Names}}')) console.log('chuan-market-radar-web-1\\nchuan-market-radar-scanner-worker-1\\nchuan-market-radar-postgres-1\\nchuan-market-radar-redis-1\\nchuan-market-radar-caddy-1\\nchuan-market-radar-signal-worker-1');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'inspect' && joined.includes('{{.Image}}')) {",
      `  if (joined.includes('web')) console.log(state.web === 'new' ? '${NEW_WEB_IMAGE}' : '${OLD_WEB_IMAGE}'); else console.log(state.scanner === 'new' ? '${NEW_SCANNER_IMAGE}' : '${OLD_SCANNER_IMAGE}'); process.exit(0);`,
      "}",
      "if (args[0] === 'inspect' && joined.includes('{{.Config.Image}}')) { console.log(joined.includes('web') ? 'chuan-market-radar-web:latest' : 'chuan-market-radar-scanner-worker:latest'); process.exit(0); }",
      "if (args[0] === 'image' && args[1] === 'inspect') {",
      `  if (args.includes(${JSON.stringify(request.rollbackWebImageRef)}) && state.retainedWeb) { console.log('${OLD_WEB_IMAGE}'); process.exit(0); }`,
      `  if (args.includes(${JSON.stringify(request.rollbackScannerWorkerImageRef)}) && state.retainedScanner && process.env.FAKE_RETENTION_MISSING !== '1') { console.log('${OLD_SCANNER_IMAGE}'); process.exit(0); }`,
      "  process.exit(1);",
      "}",
      "if (args[0] === 'tag') {",
      `  if (args[2] === ${JSON.stringify(request.rollbackWebImageRef)}) state.retainedWeb = true;`,
      `  if (args[2] === ${JSON.stringify(request.rollbackScannerWorkerImageRef)}) state.retainedScanner = true;`,
      "  save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `tag:${args[1]}:${args[2]}\\n`); process.exit(0);",
      "}",
      "if (args[0] === 'logs') {",
      "  console.log(JSON.stringify({message:'task-started',task:'scheduled-scan',scheduleMode:'fixed_rate_skip_missed'}));",
      "  console.log(JSON.stringify({message:'task-ok',task:'scheduled-scan',resultStatus:'updated'}));",
      "  console.log(JSON.stringify({message:'task-ok',task:'scheduled-scan',resultStatus:'updated'}));",
      "  if (process.env.FAKE_LOG_FAILURE === '1') console.log(JSON.stringify({message:'task-error',task:'scheduled-scan'})); else console.log(JSON.stringify({message:'task-ok',task:'scheduled-scan',resultStatus:'updated'}));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'run') {",
      "  const actionAt = args.findIndex(value => value.endsWith('autonomy-production-lease-cli.mjs')) + 1; const action = args[actionAt];",
      "  const executionAt = args.indexOf('--execution'); const execution = args[executionAt + 1];",
      "  if (action === 'acquire') fs.writeFileSync(execution, JSON.stringify({schemaVersion:'market-radar-production-lease-execution.v1',leaseId:'lease-rehearsal',fencingToken:1}));",
      "  console.log(JSON.stringify({status:action === 'release' ? 'released' : 'pass',action,leaseId:'lease-rehearsal',fencingToken:1})); process.exit(0);",
      "}",
      "if (args[0] === 'exec') {",
      "  if (joined.includes('node --input-type=module - request')) { fs.readFileSync(0, 'utf8'); process.exit(0); }",
      "  if (joined.includes('psql')) { fs.readFileSync(0, 'utf8'); console.log('1'); process.exit(0); }",
      "  if (joined.includes('redis-cli ping')) { console.log('PONG'); process.exit(0); }",
      "  if (joined.includes('pg_isready')) process.exit(0);",
      `  if (joined.includes('sha256sum')) { console.log('${identityUrlHash}  -'); process.exit(0); }`,
      "  if (joined.includes('node -')) { fs.readFileSync(0, 'utf8'); process.exit(0); }",
      "}",
      "process.exit(1);",
      "",
    ].join("\n"));

    await writeExecutable(join(fakeBin, "curl"), [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const args = process.argv.slice(2); const url = args[args.length - 1];",
      "if (!url.endsWith('/api/health')) { console.log(JSON.stringify({ok:true})); process.exit(0); }",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8')); let count = Number(fs.readFileSync(process.env.FAKE_CURL_COUNT, 'utf8')); count += 1; fs.writeFileSync(process.env.FAKE_CURL_COUNT, String(count));",
      "const completedAt = state.scanner === 'new' ? `2026-07-13T01:${String(count).padStart(2,'0')}:00.000Z` : '2026-07-13T00:00:00.000Z';",
      "console.log(JSON.stringify({ok:true,health:{level:'ready',persistence:{databaseStatus:'ready'},scan:{completedAt,freshness:'fresh',ageMinutes:0,status:'ready'},runtimeProbes:{workers:[{name:'scanner-worker',status:'healthy',lastSeenAt:completedAt}]}}}));",
      "",
    ].join("\n"));

    await writeExecutable(join(fakeBin, "sha256sum"), [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const crypto = require('node:crypto'); const file = process.argv[2];",
      `if (file === ${JSON.stringify(override)}) { console.log('${IDENTITY_OVERRIDE_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(wrapper)}) { console.log('${COMPOSE_WRAPPER_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, "docker-compose.yml"))}) { console.log('${PRODUCTION_COMPOSE_SHA256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env"))}) { console.log('${request.baseEnvSha256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env.production"))}) { console.log('${request.productionEnvSha256}  ' + file); process.exit(0); }`,
      "if (file) { console.log(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + '  ' + file); process.exit(0); }",
      "let source=''; process.stdin.on('data', c => source += c); process.stdin.on('end', () => { const value = source === 'compose-approved\\n' ? process.env.FAKE_COMPOSE_SHA : crypto.createHash('sha256').update(source).digest('hex'); console.log(value + '  -'); });",
      "",
    ].join("\n"));

    await writeExecutable(join(fakeBin, "stat"), [
      "#!/bin/sh",
      "format=$2; file=$3",
      "case \"$format:$file\" in",
      `  %a:${requestFile}|%a:${override}) echo 600 ;;`,
      `  %a:${wrapper}) echo 700 ;;`,
      `  %u:${override}|%u:${wrapper}) echo 0 ;;`,
      "  *) /usr/bin/stat \"$@\" ;;",
      "esac",
      "",
    ].join("\n"));
    await writeExecutable(join(fakeBin, "sudo"), "#!/bin/sh\n[ \"$1\" = \"-n\" ] && shift\nexec \"$@\"\n");
    await writeExecutable(join(fakeBin, "mkdir"), [
      "#!/bin/sh",
      "case \"$*\" in *'/home/ubuntu/.local/state/market-radar-autonomy'*) exit 0 ;; esac",
      "exec /bin/mkdir \"$@\"",
      "",
    ].join("\n"));
    await writeExecutable(join(fakeBin, "chmod"), [
      "#!/bin/sh",
      "case \"$*\" in *'/home/ubuntu/.local/state/market-radar-autonomy'*) exit 0 ;; esac",
      "exec /bin/chmod \"$@\"",
      "",
    ].join("\n"));
    await writeExecutable(join(fakeBin, "sleep"), "#!/bin/sh\nexit 0\n");
    await writeExecutable(join(fakeBin, "date"), [
      "#!/usr/bin/env node",
      "const fs = require('node:fs'); const args = process.argv.slice(2).join(' ');",
      "if (args === '+%s') { let value=Number(fs.readFileSync(process.env.FAKE_CLOCK,'utf8'))+1000; fs.writeFileSync(process.env.FAKE_CLOCK,String(value)); console.log(value); } else console.log('2026-07-13T01:00:00Z');",
      "",
    ].join("\n"));
    await writeExecutable(join(fakeBin, "realpath"), [
      "#!/usr/bin/env node",
      "const value=process.argv[2]; console.log(value === process.env.FAKE_ROOT ? '/home/ubuntu/apps/chuan-market-radar' : value);",
      "",
    ].join("\n"));
    await writeExecutable(join(fakeBin, "jq"), [
      "#!/usr/bin/env node",
      "const { spawnSync } = require('node:child_process'); const args=process.argv.slice(2);",
      "if (args[0] === '-r' && args[1] === '.stagingDirectory') { console.log(process.env.FAKE_STAGE); process.exit(0); }",
      "if (args[0] === '-r' && args[1] === '.evidenceDirectory') { console.log(process.env.FAKE_EVIDENCE_DIRECTORY); process.exit(0); }",
      `const result=spawnSync(${JSON.stringify(realJq)},args,{stdio:'inherit'}); process.exit(result.status ?? 1);`,
      "",
    ].join("\n"));

    const baseEnv = {
      ...process.env,
      BASE_ENV_FILE: join(root, ".env"),
      AUTONOMY_LEASE_CLI_RUNTIME: "container_node",
      BASE_URL: "http://127.0.0.1",
      CONFIRM_SCAN_SUSTAINED_HEALTH_RELEASE: "true",
      ENV_FILE: join(root, ".env.production"),
      FAKE_CLOCK: clockFile,
      FAKE_COMPOSE_SHA: PRODUCTION_COMPOSE_SHA256,
      FAKE_CURL_COUNT: curlCountFile,
      FAKE_MUTATION_LOG: mutationLog,
      FAKE_ROOT: root,
      FAKE_STAGE: stage,
      FAKE_STATE: stateFile,
      IDENTITY_OVERRIDE_FILE: override,
      IDENTITY_WRAPPER: wrapper,
      OBSERVATION_POLL_SECONDS: "0",
      PATH: `${fakeBin}:${process.env.PATH}`,
      REQUEST_FILE: requestFile,
      ROOT_DIR_OVERRIDE: root,
      SCAN_SUSTAINED_HEALTH_RELEASE_FORCE_CONTAINER_VALIDATOR: "true",
      SCAN_SUSTAINED_HEALTH_RELEASE_MODE: "production_release",
      WEB_READY_POLL_SECONDS: "0",
      WEB_READY_TIMEOUT_SECONDS: "1",
    };
    const run = (evidenceDirectory, extra = {}) => execFileAsync(
      "/bin/bash",
      [join(stage, "scripts/production/scan-sustained-health-release.sh")],
      {
        env: { ...baseEnv, FAKE_EVIDENCE_DIRECTORY: evidenceDirectory, ...extra },
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const successEvidence = join(directory, "evidence-success");
    const success = await run(successEvidence);
    assert.match(success.stdout, /PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION/);
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
      git: "target", web: "new", scanner: "new", retainedWeb: true, retainedScanner: true,
    });
    const summary = JSON.parse(await readFile(join(successEvidence, "summary.json"), "utf8"));
    assert.equal(summary.completionAdvances, 2);
    assert.equal(summary.continuousFreshness, true);
    assert.equal(summary.targetCommit, TARGET_COMMIT);
    assert.equal(summary.rollbackImagesRetained, true);
    assert.equal(summary.rollbackWebImageRef, request.rollbackWebImageRef);
    assert.equal(summary.rollbackScannerWorkerImageRef, request.rollbackScannerWorkerImageRef);
    const successMutations = await readFile(mutationLog, "utf8");
    assert.ok(successMutations.indexOf(`tag:${OLD_WEB_IMAGE}:${request.rollbackWebImageRef}`) < successMutations.indexOf("checkout:target"));
    assert.ok(successMutations.indexOf(`tag:${OLD_SCANNER_IMAGE}:${request.rollbackScannerWorkerImageRef}`) < successMutations.indexOf("checkout:target"));
    assert.ok(successMutations.indexOf("checkout:target") < successMutations.indexOf("build:web,scanner-worker"));

    await writeFile(stateFile, JSON.stringify({
      git: "baseline", web: "old", scanner: "old", retainedWeb: false, retainedScanner: false,
    }));
    await writeFile(curlCountFile, "0");
    await writeFile(clockFile, "0");
    await writeFile(mutationLog, "");
    const failureEvidence = join(directory, "evidence-failure");
    await assert.rejects(run(failureEvidence, { FAKE_LOG_FAILURE: "1" }), (error) => {
      assert.match(error.stderr, /ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_BASELINE_VERIFIED/);
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
      git: "baseline", web: "old", scanner: "old", retainedWeb: true, retainedScanner: true,
    });
    const rollback = JSON.parse(await readFile(join(failureEvidence, "rollback.json"), "utf8"));
    assert.equal(rollback.rollbackVerified, true);
    assert.equal(rollback.baselineCommit, BASELINE_COMMIT);
    const mutations = await readFile(mutationLog, "utf8");
    assert.match(mutations, /tag:sha256:/);
    assert.match(mutations, /checkout:main/);
    assert.match(mutations, /up:web:old/);
    assert.match(mutations, /up:scanner-worker:old/);

    await writeFile(stateFile, JSON.stringify({
      git: "baseline", web: "old", scanner: "old", retainedWeb: false, retainedScanner: false,
    }));
    await writeFile(curlCountFile, "0");
    await writeFile(clockFile, "0");
    await writeFile(mutationLog, "");
    const missingRetentionEvidence = join(directory, "evidence-retention-missing");
    await assert.rejects(run(missingRetentionEvidence, { FAKE_RETENTION_MISSING: "1" }), (error) => {
      assert.match(error.stderr, /rollback image retention verification failed before production mutation/);
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
      git: "baseline", web: "old", scanner: "old", retainedWeb: true, retainedScanner: true,
    });
    const rejectedMutations = await readFile(mutationLog, "utf8");
    assert.doesNotMatch(rejectedMutations, /checkout:target|build:web,scanner-worker|up:web|up:scanner-worker/);

    await writeFile(stateFile, JSON.stringify({
      git: "baseline", web: "old", scanner: "old", retainedWeb: false, retainedScanner: false,
    }));
    await writeFile(mutationLog, "");
    const manifestPath = join(stage, "transport-manifest.json");
    const driftedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    driftedManifest.sourceTree = "f".repeat(40);
    await writeFile(manifestPath, `${JSON.stringify(driftedManifest)}\n`, { mode: 0o600 });
    const driftEvidence = join(directory, "evidence-manifest-drift");
    await assert.rejects(run(driftEvidence), (error) => {
      assert.match(error.stderr, /staged transport manifest does not match approval/);
      return true;
    });
    assert.doesNotMatch(await readFile(mutationLog, "utf8"), /tag:|checkout:target|build:web,scanner-worker|up:web|up:scanner-worker/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
