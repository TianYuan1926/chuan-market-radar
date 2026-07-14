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
import { test } from "node:test";
import { promisify } from "node:util";
import {
  BASELINE_COMMIT,
  CONTRACT_PATH,
  PACKAGE_ID,
  RELEASE_DIFF_SHA256,
  RELEASE_PATH_SET_SHA256,
  TARGET_COMMIT,
  TARGET_COMPOSE_SHA256,
  TARGET_REMOTE_BRANCH,
  TARGET_TREE,
  loadContract,
  rollbackImageRef,
  sha256,
} from "./candidate-dormant-deploy.mjs";

const execFileAsync = promisify(execFile);
const OLD_WEB_IMAGE = `sha256:${"1".repeat(64)}`;
const NEW_WEB_IMAGE = `sha256:${"2".repeat(64)}`;

async function writeExecutable(path, source) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

function nodeScript(lines) {
  return [`#!${process.execPath}`, ...lines, ""].join("\n");
}

test("isolated execute proves dormant Web-only success and verified baseline rollback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-dormant-execute-"));
  const fakeBin = join(directory, "bin");
  const root = join(directory, "production");
  const stage = join(directory, "wp-g0-2-dormant-runtime-deploy-rehearsal1");
  const secure = join(directory, "secure");
  const stateFile = join(directory, "state.json");
  const mutationLog = join(directory, "mutation.log");
  const curlCountFile = join(directory, "curl-count");
  const clockFile = join(directory, "clock");
  const requestFile = join(stage, "approval-request.json");
  const wrapper = join(secure, "compose-identity-safe");
  const override = join(secure, "runtime-identity.override.yml");
  const contract = await loadContract();

  try {
    await mkdir(fakeBin, { recursive: true });
    await mkdir(root, { recursive: true });
    await mkdir(secure, { recursive: true });
    for (const file of [
      "scripts/governance/autonomy-production-lease-cli.mjs",
      "scripts/governance/autonomy-production-lease.mjs",
      "scripts/governance/autonomy-policy.mjs",
      "scripts/production/candidate-dormant-deploy-entrypoint.sh",
      "scripts/production/candidate-dormant-deploy.mjs",
      "scripts/production/candidate-dormant-deploy.sh",
      CONTRACT_PATH,
    ]) {
      await mkdir(dirname(join(stage, file)), { recursive: true });
      await copyFile(file, join(stage, file));
    }
    await writeFile(join(root, "docker-compose.yml"), "baseline-compose\n");
    await writeFile(join(root, ".env"), "CANDIDATE_EPISODE_SHADOW_WRITE=false\n", { mode: 0o600 });
    await writeFile(join(root, ".env.production"), [
      "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
      "CANDIDATE_EPISODE_SHADOW_WRITE=false",
      "CANDIDATE_EPISODE_DUAL_READ=false",
      "CANDIDATE_EPISODE_CANONICAL_READ=false",
      "CANDIDATE_EPISODE_REVIEW_READ=false",
      "CANDIDATE_SOURCE_DATABASE_URL=",
      "CANDIDATE_CONSUMER_DATABASE_URL=",
      "CANDIDATE_MONITOR_DATABASE_URL=",
      "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
      "CANDIDATE_SHADOW_WORKER_EXPECTED=false",
      "",
    ].join("\n"), { mode: 0o600 });
    await writeFile(override, "services:\n  web: {}\n", { mode: 0o600 });
    await writeFile(stateFile, JSON.stringify({ git: "baseline", web: "old", retained: false }));
    await writeFile(mutationLog, "");
    await writeFile(curlCountFile, "0");
    await writeFile(clockFile, "0");

    const stagedContract = await readFile(join(stage, CONTRACT_PATH));
    const stagedRunner = await readFile(join(stage, "scripts/production/candidate-dormant-deploy.sh"));
    const baselineComposeSha256 = "3".repeat(64);
    const baseEnvSha256 = "4".repeat(64);
    const productionEnvSha256 = "5".repeat(64);
    const identityOverrideSha256 = "6".repeat(64);
    const composeWrapperSha256 = "7".repeat(64);
    const runnerSourceCommit = "8".repeat(40);
    const runnerSourceParentCommit = "9".repeat(40);
    const runnerSourceTree = "a".repeat(40);
    const now = Date.now();
    const request = {
      approvalExpiresAt: new Date(now + 89 * 60_000).toISOString(),
      approvalIssuedAt: new Date(now - 30_000).toISOString(),
      approvalRef: "isolated-dormant-rehearsal",
      automaticRollbackAllowed: true,
      autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
      baseEnvSha256,
      baselineCommit: BASELINE_COMMIT,
      baselineComposeSha256,
      buildAllowed: true,
      candidateControlLifecycleStartAllowed: false,
      candidateDatabaseUrlConfigurationAllowed: false,
      candidateFeatureFlagEnablementAllowed: false,
      candidateRuntimeMutationAllowed: false,
      candidateWorkerStartAllowed: false,
      codeActivationAllowed: false,
      composeWrapperSha256,
      contractSha256: sha256(stagedContract),
      databaseMutationAllowed: false,
      detachedHeadAfterSuccess: true,
      environmentMutationAllowed: false,
      evidenceDirectory: join(directory, "evidence-placeholder"),
      execute: true,
      gateEvidenceSha256: "b".repeat(64),
      identityOverrideSha256,
      migrationAllowed: false,
      observationDurationSeconds: 1800,
      observationPollSeconds: 30,
      operator: "codex-isolated-rehearsal",
      otherServiceRestartAllowed: false,
      packageId: PACKAGE_ID,
      policySha256: "c".repeat(64),
      productionEnvSha256,
      productionRepositoryMutationAllowed: true,
      redisMutationAllowed: false,
      releaseArtifactSha256: contract.artifact.sha256,
      releaseDiffSha256: RELEASE_DIFF_SHA256,
      releasePathSetSha256: RELEASE_PATH_SET_SHA256,
      rollbackImageRetentionRequired: true,
      rollbackWebImageRef: rollbackImageRef(OLD_WEB_IMAGE),
      runnerSha256: sha256(stagedRunner),
      runnerSourceCommit,
      runnerSourceDiffSha256: "d".repeat(64),
      runnerSourceParentCommit,
      runnerSourcePathSetSha256: "e".repeat(64),
      runnerSourceTree,
      runnerUnitName: "market-radar-dormant-rehearsal1",
      services: ["web"],
      sessionIndependentExecutionRequired: true,
      sourceFetchAllowed: true,
      stagingDirectory: stage,
      targetCommit: TARGET_COMMIT,
      targetComposeSha256: TARGET_COMPOSE_SHA256,
      targetRemoteBranch: TARGET_REMOTE_BRANCH,
      targetTree: TARGET_TREE,
      temporaryArtifactCleanupRequired: true,
      transportBundleSha256: "f".repeat(64),
      transportMethod: "approved_orcaterm_bundle_upload",
      webImageId: OLD_WEB_IMAGE,
      autonomyAuthorization: {
        approvalId: "dormant-rehearsal-approval-1",
      },
    };
    await writeFile(requestFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
    await writeFile(join(stage, "transport-manifest.json"), `${JSON.stringify({
      sourceCommit: runnerSourceCommit,
      baselineCommit: BASELINE_COMMIT,
      targetCommit: TARGET_COMMIT,
      releaseDiffSha256: RELEASE_DIFF_SHA256,
      contractSha256: request.contractSha256,
      approvalEligible: true,
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      containsSecrets: false,
      sessionIndependentExecutionRequired: true,
      rollbackImageRetentionRequired: true,
      rollbackRetentionRepository: "market-radar-rollback/wp-g0-2-dormant",
      rollbackCleanupRequiresSeparateApproval: true,
    })}\n`, { mode: 0o600 });

    await writeExecutable(wrapper, nodeScript([
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2).join(' ');",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      "if (args === 'config --format json') { console.log(JSON.stringify({services:{web:{environment:{DATABASE_URL:'identity-url'}}}})); process.exit(0); }",
      "if (args === 'ps -q web') { console.log(state.web === 'new' ? 'web-new-id' : 'web-old-id'); process.exit(0); }",
      "if (args === 'build web') { if (!state.retained || state.git !== 'target') process.exit(9); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'build:web\\n'); process.exit(0); }",
      "if (args.startsWith('up -d --no-deps') && args.endsWith('web')) { state.web = state.git === 'target' ? 'new' : 'old'; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `up:web:${state.web}\\n`); process.exit(0); }",
      "if (args === 'exec -T web node -') { fs.readFileSync(0, 'utf8'); process.exit(0); }",
      "process.exit(1);",
    ]));

    await writeExecutable(join(fakeBin, "git"), nodeScript([
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2); const command = args[0] === '-C' ? args.slice(2) : args;",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      `if (command[0] === 'rev-parse' && command[1] === 'HEAD') { console.log(state.git === 'target' ? '${TARGET_COMMIT}' : '${BASELINE_COMMIT}'); process.exit(0); }`,
      `if (command[0] === 'rev-parse' && command[1] === 'origin/${TARGET_REMOTE_BRANCH}') { console.log('${TARGET_COMMIT}'); process.exit(0); }`,
      `if (command[0] === 'rev-parse' && command[1] === '${TARGET_COMMIT}^{tree}') { console.log('${TARGET_TREE}'); process.exit(0); }`,
      "if (command[0] === 'branch' && command[1] === '--show-current') process.exit(0);",
      "if (command[0] === 'status') process.exit(0);",
      "if (command[0] === 'fetch') { fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'fetch:target\\n'); process.exit(0); }",
      `if (command[0] === 'rev-list') { console.log('${TARGET_COMMIT} ${BASELINE_COMMIT}'); process.exit(0); }`,
      `if (command[0] === 'diff-tree' && command.includes('--name-status')) { console.log(${JSON.stringify(contract.releaseBoundary.releaseDiffLines.join("\n"))}); process.exit(0); }`,
      `if (command[0] === 'diff-tree' && command.includes('--name-only')) { console.log(${JSON.stringify(contract.releaseBoundary.releaseDiffLines.map(line => line.split("\t")[1]).join("\n"))}); process.exit(0); }`,
      "if (command[0] === 'show') { console.log('target-compose'); process.exit(0); }",
      `if (command[0] === 'checkout' && command[1] === '--detach') { state.git = command[2] === '${TARGET_COMMIT}' ? 'target' : 'baseline'; if (state.git === 'baseline') state.rolledBack = true; save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'checkout:' + state.git + '\\n'); process.exit(0); }`,
      "process.exit(1);",
    ]));

    await writeExecutable(join(fakeBin, "docker"), nodeScript([
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2); const joined = args.join(' ');",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      "const webId = state.web === 'new' ? 'web-new-id' : 'web-old-id';",
      "if (args[0] === 'ps') {",
      "  if (joined.includes('name=^/chuan-market-radar-web-1$')) console.log(webId);",
      "  else if (joined.includes('{{.Names}}={{.Image}}={{.ID}}')) console.log('chuan-market-radar-scanner-worker-1=scanner:stable=scanner-id\\nchuan-market-radar-postgres-1=postgres:stable=postgres-id\\nchuan-market-radar-redis-1=redis:stable=redis-id\\nchuan-market-radar-caddy-1=caddy:stable=caddy-id');",
      "  else if (joined.includes('{{.Names}}')) console.log('chuan-market-radar-web-1\\nchuan-market-radar-scanner-worker-1\\nchuan-market-radar-postgres-1\\nchuan-market-radar-redis-1\\nchuan-market-radar-caddy-1');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'inspect' && joined.includes('{{.Config.Image}}')) { console.log('chuan-market-radar-web:latest'); process.exit(0); }",
      `if (args[0] === 'inspect' && joined.includes('{{.Image}}')) { console.log(state.web === 'new' ? '${NEW_WEB_IMAGE}' : '${OLD_WEB_IMAGE}'); process.exit(0); }`,
      "if (args[0] === 'image' && args[1] === 'inspect') {",
      `  if (args.includes(${JSON.stringify(request.rollbackWebImageRef)}) && state.retained) { console.log('${OLD_WEB_IMAGE}'); process.exit(0); }`,
      "  process.exit(1);",
      "}",
      "if (args[0] === 'tag') {",
      `  if (args[1] === '${OLD_WEB_IMAGE}' && args[2] === ${JSON.stringify(request.rollbackWebImageRef)}) state.retained = true;`,
      "  save(); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `tag:${args[1]}:${args[2]}\\n`); process.exit(0);",
      "}",
      "if (args[0] === 'run') {",
      "  const actionAt = args.findIndex(value => value.endsWith('autonomy-production-lease-cli.mjs')) + 1; const action = args[actionAt];",
      "  const executionAt = args.indexOf('--execution'); const execution = args[executionAt + 1];",
      "  if (action === 'acquire') fs.writeFileSync(execution, JSON.stringify({leaseId:'dormant-rehearsal',fencingToken:1}));",
      "  fs.appendFileSync(process.env.FAKE_MUTATION_LOG, `lease:container:${action}\\n`);",
      "  console.log(JSON.stringify({status:action === 'release' ? 'released' : 'pass',action,leaseId:'dormant-rehearsal',fencingToken:1})); process.exit(0);",
      "}",
      "if (args[0] === 'exec') {",
      "  if (joined.includes('CANDIDATE_DORMANT_DEPLOY_STDIN=true')) { fs.readFileSync(0, 'utf8'); fs.appendFileSync(process.env.FAKE_MUTATION_LOG, 'validator:container\\n'); process.exit(0); }",
      "  if (joined.includes('redis-cli ping')) { console.log('PONG'); process.exit(0); }",
      "  if (joined.includes('pg_isready')) process.exit(0);",
      "  if (joined.includes('psql')) { console.log('9|0'); process.exit(0); }",
      `  if (joined.includes('sha256sum')) { console.log('${createHash("sha256").update("identity-url").digest("hex")}  -'); process.exit(0); }`,
      "}",
      "process.exit(1);",
    ]));

    await writeExecutable(join(fakeBin, "curl"), nodeScript([
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2); const url = args[args.length - 1];",
      "if (!url.endsWith('/api/health')) { console.log(JSON.stringify({ok:true})); process.exit(0); }",
      "const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));",
      "let count = Number(fs.readFileSync(process.env.FAKE_CURL_COUNT, 'utf8')) + 1; fs.writeFileSync(process.env.FAKE_CURL_COUNT, String(count));",
      "const observationFail = process.env.FAKE_FAIL_OBSERVATION === '1' && state.git === 'target' && count >= 3;",
      "let rollbackRecoveryPending = false;",
      "if (process.env.FAKE_ROLLBACK_HEALTH_RECOVERY === '1' && state.git === 'baseline' && state.rolledBack) {",
      "  state.rollbackHealthChecks = Number(state.rollbackHealthChecks || 0) + 1;",
      "  rollbackRecoveryPending = state.rollbackHealthChecks <= 2;",
      "  fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));",
      "}",
      "const fail = observationFail || rollbackRecoveryPending;",
      "console.log(JSON.stringify({ok:true,health:{level:fail?'degraded':'ready',persistence:{databaseStatus:'ready'},scan:{freshness:'fresh'},runtimeProbes:{workers:[{name:'scanner-worker',status:'healthy'}]}}}));",
    ]));

    await writeExecutable(join(fakeBin, "node"), nodeScript([
      "const fs = require('node:fs'); const { spawnSync } = require('node:child_process');",
      "const args = process.argv.slice(2); const script = args[0] || '';",
      "if (script.endsWith('candidate-dormant-deploy.mjs')) process.exit(0);",
      "if (script.endsWith('autonomy-production-lease-cli.mjs')) {",
      "  const action = args[1]; const executionAt = args.indexOf('--execution');",
      "  if (action === 'acquire' && executionAt >= 0) fs.writeFileSync(args[executionAt + 1], JSON.stringify({leaseId:'dormant-rehearsal',fencingToken:1}));",
      "  console.log(JSON.stringify({status:action === 'release' ? 'released' : 'pass',action,leaseId:'dormant-rehearsal',fencingToken:1})); process.exit(0);",
      "}",
      `const result = spawnSync(${JSON.stringify(process.execPath)}, args, {stdio:'inherit'}); process.exit(result.status ?? 1);`,
    ]));

    await writeExecutable(join(fakeBin, "sha256sum"), nodeScript([
      "const fs = require('node:fs'); const crypto = require('node:crypto'); const file = process.argv[2];",
      `if (file === ${JSON.stringify(override)}) { console.log('${identityOverrideSha256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(wrapper)}) { console.log('${composeWrapperSha256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env"))}) { console.log('${baseEnvSha256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, ".env.production"))}) { console.log('${productionEnvSha256}  ' + file); process.exit(0); }`,
      `if (file === ${JSON.stringify(join(root, "docker-compose.yml"))}) { const state=JSON.parse(fs.readFileSync(process.env.FAKE_STATE,'utf8')); console.log((state.git === 'target' ? '${TARGET_COMPOSE_SHA256}' : '${baselineComposeSha256}') + '  ' + file); process.exit(0); }`,
      "if (file) { console.log(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + '  ' + file); process.exit(0); }",
      "let source=''; process.stdin.on('data', c => source += c); process.stdin.on('end', () => {",
      `  let value = source === 'target-compose\\n' ? '${TARGET_COMPOSE_SHA256}' : crypto.createHash('sha256').update(source).digest('hex');`,
      "  console.log(value + '  -');",
      "});",
    ]));

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
    await writeExecutable(join(fakeBin, "mkdir"), "#!/bin/sh\ncase \"$*\" in *'/home/ubuntu/.local/state/market-radar-autonomy'*) exit 0 ;; esac\nexec /bin/mkdir \"$@\"\n");
    await writeExecutable(join(fakeBin, "chmod"), "#!/bin/sh\ncase \"$*\" in *'/home/ubuntu/.local/state/market-radar-autonomy'*) exit 0 ;; esac\nexec /bin/chmod \"$@\"\n");
    await writeExecutable(join(fakeBin, "sleep"), "#!/bin/sh\nexit 0\n");
    await writeExecutable(join(fakeBin, "date"), nodeScript([
      "const fs = require('node:fs'); const args = process.argv.slice(2).join(' ');",
      "if (args === '+%s') { let value=Number(fs.readFileSync(process.env.FAKE_CLOCK,'utf8'))+1000; fs.writeFileSync(process.env.FAKE_CLOCK,String(value)); console.log(value); } else console.log('2026-07-14T06:00:00Z');",
    ]));
    await writeExecutable(join(fakeBin, "realpath"), nodeScript([
      "const value=process.argv[2];",
      "if (value === process.env.FAKE_ROOT) console.log('/home/ubuntu/apps/chuan-market-radar');",
      "else if (value === '/home/ubuntu/.local/state/market-radar-autonomy') console.log(value);",
      "else console.log(value);",
    ]));

    const baseEnv = {
      ...process.env,
      AUTONOMY_LEASE_CLI_RUNTIME: "container_node",
      BASE_ENV_FILE: join(root, ".env"),
      BASE_URL: "http://127.0.0.1",
      CONFIRM_DORMANT_DEPLOY: "true",
      CANDIDATE_DORMANT_DEPLOY_FORCE_CONTAINER_VALIDATOR: "true",
      DORMANT_DEPLOY_MODE: "production_deploy",
      ENV_FILE: join(root, ".env.production"),
      FAKE_CLOCK: clockFile,
      FAKE_CURL_COUNT: curlCountFile,
      FAKE_MUTATION_LOG: mutationLog,
      FAKE_ROOT: root,
      FAKE_STATE: stateFile,
      IDENTITY_OVERRIDE_FILE: override,
      IDENTITY_WRAPPER: wrapper,
      OBSERVATION_POLL_SECONDS: "0",
      PATH: `${fakeBin}:${process.env.PATH}`,
      REQUEST_FILE: requestFile,
      ROOT_DIR_OVERRIDE: root,
      WEB_READY_POLL_SECONDS: "0",
      WEB_READY_TIMEOUT_SECONDS: "1",
    };
    const run = async (evidenceDirectory, extra = {}) => {
      request.evidenceDirectory = evidenceDirectory;
      await writeFile(requestFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
      return execFileAsync("/bin/bash", [join(stage, "scripts/production/candidate-dormant-deploy.sh")], {
        env: { ...baseEnv, ...extra },
        maxBuffer: 4 * 1024 * 1024,
      });
    };

    const successEvidence = join(directory, "evidence-success");
    const success = await run(successEvidence);
    assert.match(success.stdout, /PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION/);
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
      git: "target", web: "new", retained: true,
    });
    const summary = JSON.parse(await readFile(join(successEvidence, "summary.json"), "utf8"));
    assert.equal(summary.targetCommit, TARGET_COMMIT);
    assert.equal(summary.candidateDormant, true);
    assert.equal(summary.candidateWorkerAbsent, true);
    assert.equal(summary.rollbackImageRetained, true);
    assert.equal(summary.sampleCount >= 2, true);
    const successMutations = await readFile(mutationLog, "utf8");
    assert.ok(successMutations.indexOf(`tag:${OLD_WEB_IMAGE}:${request.rollbackWebImageRef}`) < successMutations.indexOf("checkout:target"));
    assert.ok(successMutations.indexOf("checkout:target") < successMutations.indexOf("build:web"));
    assert.match(successMutations, /validator:container/);
    assert.match(successMutations, /lease:container:acquire/);
    assert.doesNotMatch(successMutations, /scanner-worker|candidate-shadow-worker/);

    await writeFile(stateFile, JSON.stringify({ git: "baseline", web: "old", retained: false }));
    await writeFile(mutationLog, "");
    await writeFile(curlCountFile, "0");
    await writeFile(clockFile, "0");
    const failureEvidence = join(directory, "evidence-failure");
    await assert.rejects(run(failureEvidence, {
      FAKE_FAIL_OBSERVATION: "1",
      FAKE_ROLLBACK_HEALTH_RECOVERY: "1",
    }), (error) => {
      assert.match(error.stderr, /check_failed phase=continuous-observation check=health_ready_fresh/);
      assert.match(error.stderr, /ROLLBACK_DORMANT_DEPLOY_BASELINE_VERIFIED/);
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
      git: "baseline", web: "old", retained: true, rolledBack: true, rollbackHealthChecks: 3,
    });
    const rollback = JSON.parse(await readFile(join(failureEvidence, "rollback.json"), "utf8"));
    assert.equal(rollback.rollbackVerified, true);
    assert.equal(rollback.baselineCommit, BASELINE_COMMIT);
    assert.equal(rollback.failurePhase, "continuous-observation");
    assert.equal(rollback.failureCheck, "health_ready_fresh");
    assert.equal(rollback.rollbackFailedCheck, "");
    assert.equal(rollback.rollbackHealthAttempts, 2);
    assert.equal(rollback.rollbackHealthRecoveredAfterWait, true);
    const failureMutations = await readFile(mutationLog, "utf8");
    assert.match(failureMutations, /checkout:target/);
    assert.match(failureMutations, /checkout:baseline/);
    assert.match(failureMutations, /up:web:old/);
    assert.doesNotMatch(failureMutations, /scanner-worker|candidate-shadow-worker/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
