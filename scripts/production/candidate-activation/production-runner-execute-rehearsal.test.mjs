import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import contract from "../../../docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function artifact(root, files) {
  const checksums = {};
  for (const file of [...files].sort()) checksums[file] = sha256(await readFile(join(root, file)));
  return sha256(JSON.stringify(checksums));
}

async function copyInto(sourceRoot, targetRoot, file) {
  await mkdir(dirname(join(targetRoot, file)), { recursive: true });
  await copyFile(join(sourceRoot, file), join(targetRoot, file));
}

async function scenario({ failBuild = false, failProductionCheck = false } = {}) {
  const directory = await mkdtemp("/tmp/wp_g0_2_rehearsal_candidate_activation_");
  const source = join(directory, "source");
  const production = join(directory, "production");
  const secure = join(directory, "secure");
  const ops = join(directory, "ops");
  const fakeBin = join(directory, "bin");
  const dockerLog = join(directory, "docker.log");
  const gitLog = join(directory, "git.log");
  const gitState = join(directory, "git-state");
  const approvedCommit = "a".repeat(40);
  const rollbackCommit = "b".repeat(40);
  const releaseId = "candidate-shadow-rehearsal-release";
  const approvalIssuedAt = new Date(Date.now() - 60_000).toISOString();
  const approvalExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const originalEnv = [
    "CANDIDATE_SOURCE_DATABASE_URL=candidate-source-placeholder",
    "CANDIDATE_CONSUMER_DATABASE_URL=candidate-consumer-placeholder",
    "CANDIDATE_MONITOR_DATABASE_URL=candidate-monitor-placeholder",
    "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
    "CANDIDATE_EPISODE_SHADOW_WRITE=false",
    "CANDIDATE_EPISODE_DUAL_READ=false",
    "CANDIDATE_EPISODE_CANONICAL_READ=false",
    "CANDIDATE_EPISODE_REVIEW_READ=false",
    "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
    "CANDIDATE_SHADOW_WORKER_EXPECTED=false",
    "",
  ].join("\n");
  await Promise.all([source, production, secure, ops, fakeBin].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  const files = new Set([
    ...contract.activationReleaseArtifact.files,
    ...contract.runnerArtifact.files,
    "docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json",
  ]);
  for (const file of files) await copyInto(process.cwd(), source, file);
  const flagsPath = join(source, "src/lib/candidate-episode/feature-flags.ts");
  await writeFile(flagsPath, (await readFile(flagsPath, "utf8")).replace(
    "CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const",
    "CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const",
  ));
  await mkdir(join(production, "scripts", "verify"), { recursive: true });
  await writeFile(join(production, ".env"), "POSTGRES_DB=market_radar\n", { mode: 0o600 });
  await writeFile(join(production, ".env.production"), originalEnv, { mode: 0o600 });
  await writeFile(join(production, "docker-compose.yml"), "services: {}\n");
  await writeFile(join(production, "scripts", "verify", "production-check.sh"),
    "#!/bin/sh\n[ \"${FAIL_PRODUCTION_CHECK:-false}\" = false ]\n");
  await chmod(join(production, "scripts", "verify", "production-check.sh"), 0o755);

  const request = {
    approvalDigest: `sha256:${"d".repeat(64)}`,
    approvalExpiresAt,
    approvalIssuedAt,
    approvalRef: "candidate-activation-rehearsal",
    approvedActivationArtifactSha256: await artifact(source, contract.activationReleaseArtifact.files),
    approvedCommit,
    approvedRunnerArtifactSha256: contract.runnerArtifact.sha256,
    autonomyAuthorization: {
      schemaVersion: "market-radar-package-authorization.v1",
      packageId: "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE",
      actionClass: "candidate_shadow_activation",
      riskTier: "R2_REVERSIBLE_RUNTIME_AND_CONTROL",
      approvalId: "candidate-activation-rehearsal-id",
      nonce: "candidate-activation-rehearsal-nonce",
      revocationEpoch: 2,
      issuedAt: approvalIssuedAt,
      expiresAt: approvalExpiresAt,
      maxExecutions: 1,
    },
    autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
    automaticControlRollbackAllowed: true,
    automaticEnvironmentRollbackAllowed: true,
    automaticServiceRollbackAllowed: true,
    baseEnvSha256: "1".repeat(64),
    businessDmlAllowed: false,
    candidateDatabaseUrlMutationAllowed: false,
    candidateFeatureFlagEnablementAllowed: true,
    candidateWorkerStartAllowed: true,
    canonicalReadAllowed: false,
    canonicalWriteAllowed: false,
    codeActivationAllowed: true,
    composeProfile: "candidate-shadow-runtime",
    composeSha256: "2".repeat(64),
    controlLifecycleStartAllowed: true,
    dormantDeployStatus: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
    dormantEvidencePath: "/tmp/wp_g0_2_rehearsal_candidate_activation_evidence/summary.json",
    dormantEvidenceSha256: "8".repeat(64),
    dualReadAllowed: false,
    evidenceDirectory: join(ops, "evidence-retained"),
    environmentMutationAllowed: true,
    execute: true,
    identityOverrideSha256: "3".repeat(64),
    identityOverridePath: join(directory, "runtime-identity.override.yml"),
    identityWrapperSha256: "4".repeat(64),
    identityWrapperPath: join(directory, "compose-identity-safe"),
    migrationAllowed: false,
    migrationId: "candidate-episode-v1",
    minimumObservationHours: 24,
    observationIntervalSeconds: 300,
    operator: "rehearsal",
    observerUnitName: "market-radar-candidate-observer-rehearsal01",
    opsRoot: ops,
    packageId: "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE",
    postgresAdminEnvPath: "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    productionEnvSha256: "5".repeat(64),
    productionRoot: production,
    productionRankingMutationAllowed: false,
    releaseId,
    reviewReadAllowed: false,
    rollbackCommit,
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-candidate-activation:web-${"6".repeat(16)}`,
    runnerUnitName: "market-radar-candidate-activation-rehearsal01",
    runtimeIdentityEvidencePath: "/tmp/wp_g0_2_rehearsal_candidate_activation_evidence/runtime-identity-result.json",
    runtimeIdentityEvidenceSha256: "9".repeat(64),
    runtimeIdentityStatus: "PASS_RUNTIME_IDENTITY_AND_PERMISSION",
    runnerContractSha256: sha256(await readFile(join(source, "docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json"))),
    schemaDdlAllowed: false,
    secureRoot: secure,
    sessionIndependentExecutionRequired: true,
    services: ["web", "candidate-shadow-worker"],
    shadowWriteAllowed: true,
    stagingDirectory: join(directory, "stage"),
    temporaryArtifactCleanupRequired: true,
    transportBundleSha256: "7".repeat(64),
    webImageId: `sha256:${"6".repeat(64)}`,
    workerExpectedAllowed: true,
  };
  await writeFile(join(secure, "request.json"), JSON.stringify(request), { mode: 0o600 });
  await writeFile(join(secure, "migration-admin.url"), "postgresql://redacted.invalid/db\n", { mode: 0o600 });
  await writeFile(join(secure, "dormant-deploy-result.json"), JSON.stringify({
    completedAt: new Date().toISOString(),
    targetCommit: "c".repeat(40),
    status: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
  }), { mode: 0o600 });
  await writeFile(join(secure, "runtime-identity-result.json"), JSON.stringify({
    candidateDatabaseUrlsConfigured: 3,
    candidateFeatureFlagsEnabled: 0,
    completedAt: new Date().toISOString(),
    dormantDeployCommit: "c".repeat(40),
    productionCommit: rollbackCommit,
    runtimeLogins: 3,
    status: "PASS_RUNTIME_IDENTITY_AND_PERMISSION",
  }), { mode: 0o600 });
  request.dormantEvidenceSha256 = sha256(await readFile(join(secure, "dormant-deploy-result.json")));
  request.runtimeIdentityEvidenceSha256 = sha256(await readFile(join(secure, "runtime-identity-result.json")));
  await writeFile(join(secure, "request.json"), JSON.stringify(request), { mode: 0o600 });
  await writeFile(dockerLog, "");
  await writeFile(gitLog, "");
  await writeFile(gitState, rollbackCommit + "\n");

  const fakeGit = `#!/usr/bin/env node
const fs=require('fs'); const args=process.argv.slice(2); const joined=args.join(' ');
fs.appendFileSync(process.env.FAKE_GIT_LOG, joined+'\\n');
const sourceCall=args.includes(process.env.FAKE_SOURCE_ROOT);
if (args.includes('status')) process.exit(0);
if (args.includes('branch') && args.includes('--show-current')) process.exit(0);
if (args.includes('rev-parse') && args.includes('origin/main')) { console.log(process.env.FAKE_APPROVED_COMMIT); process.exit(0); }
if (args.includes('rev-parse')) { console.log(sourceCall ? process.env.FAKE_APPROVED_COMMIT : fs.readFileSync(process.env.FAKE_GIT_STATE,'utf8').trim()); process.exit(0); }
if (args.includes('checkout') && args.includes('--detach')) { fs.writeFileSync(process.env.FAKE_GIT_STATE,args.at(-1)+'\\n'); process.exit(0); }
process.exit(0);
`;
  const fakeDocker = `#!/usr/bin/env node
const fs=require('fs'); const args=process.argv.slice(2); const joined=args.join(' ');
fs.appendFileSync(process.env.FAKE_DOCKER_LOG,joined+'\\n');
if (args[0]==='ps') process.exit(0);
if (args[0]==='inspect' && joined.includes('{{.Image}}')) { console.log('sha256:old-web'); process.exit(0); }
if (args[0]==='inspect' && joined.includes('NetworkSettings.Networks')) { console.log('rehearsal-network'); process.exit(0); }
if (args[0]==='tag') process.exit(0);
if (args[0]==='run') {
  if (joined.includes('control-preflight')) console.log(JSON.stringify({status:'pass',candidateLedger:9,candidateControlRows:0}));
  else if (joined.includes('control-start')) console.log(JSON.stringify({status:'pass',phase:'shadow_capture',authorityEpoch:1}));
  else if (joined.includes('control-rollback')) console.log(JSON.stringify({status:'pass',phase:'legacy',authorityEpoch:2,writeFrozen:true}));
  process.exit(0);
}
if (args.includes('compose') && joined.includes('ps -q web')) { console.log('web-container'); process.exit(0); }
if (args.includes('compose') && joined.includes('build web candidate-shadow-worker') && process.env.FAIL_BUILD==='true') process.exit(7);
if (args.includes('compose') && joined.includes('exec -T web node -')) { fs.readFileSync(0); console.log(JSON.stringify({candidateMode:'active'})); process.exit(0); }
process.exit(0);
`;
  await writeFile(join(fakeBin, "git"), fakeGit);
  await writeFile(join(fakeBin, "docker"), fakeDocker);
  await chmod(join(fakeBin, "git"), 0o755);
  await chmod(join(fakeBin, "docker"), 0o755);

  const env = {
    ...process.env,
    BASE_ENV_FILE: join(production, ".env"),
    CANDIDATE_ACTIVATION_MODE: "production_activate",
    CONFIRM_CANDIDATE_ACTIVATION: "true",
    ENV_FILE: join(production, ".env.production"),
    FAIL_PRODUCTION_CHECK: String(failProductionCheck),
    FAIL_BUILD: String(failBuild),
    FAKE_APPROVED_COMMIT: approvedCommit,
    FAKE_DOCKER_LOG: dockerLog,
    FAKE_GIT_LOG: gitLog,
    FAKE_GIT_STATE: gitState,
    FAKE_ROLLBACK_COMMIT: rollbackCommit,
    FAKE_SOURCE_ROOT: source,
    OPS_ROOT: ops,
    PATH: fakeBin + ":" + process.env.PATH,
    ROOT_DIR_OVERRIDE: production,
    REQUEST_FILE: join(secure, "request.json"),
    SECURE_ROOT: secure,
    START_CANDIDATE_OBSERVER: "false",
  };
  try {
    await execFileAsync(join(fakeBin, "docker"), ["ps"], { env });
    const execution = execFileAsync("/bin/bash", [
      join(source, "scripts/production/candidate-activation/production-runner.sh"),
    ], { cwd: production, env, maxBuffer: 2 * 1024 * 1024 });
    if (failBuild || failProductionCheck) await assert.rejects(execution);
    else assert.match((await execution).stdout, /PASS_IMMEDIATE_SHADOW_CAPTURE_AWAITING_OBSERVATION/);
    return {
      docker: await readFile(dockerLog, "utf8"),
      environment: await readFile(join(production, ".env.production"), "utf8"),
      git: await readFile(gitLog, "utf8"),
      head: (await readFile(gitState, "utf8")).trim(),
      originalEnv,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("isolated activation executes only shadow web and candidate worker scope", async () => {
  const result = await scenario();
  assert.match(result.environment, /CANDIDATE_EPISODE_SHADOW_WRITE="true"/);
  assert.match(result.environment, /CANDIDATE_EPISODE_CANONICAL_WRITE="false"/);
  assert.match(result.environment, /CANDIDATE_SHADOW_WORKER_EXPECTED="true"/);
  assert.match(result.docker, /control-start/);
  assert.match(result.docker, /--profile candidate-shadow-runtime build web candidate-shadow-worker/);
  assert.match(result.docker, /--profile candidate-shadow-runtime up -d --no-deps --no-build candidate-shadow-worker/);
  assert.doesNotMatch(result.docker, /--remove-orphans|candidate:migrate|backtest:formal/);
  assert.equal(result.head, "a".repeat(40));
});

test("isolated failure restores env, web, git and database control", async () => {
  const result = await scenario({ failProductionCheck: true });
  assert.equal(result.environment, result.originalEnv);
  assert.match(result.docker, /stop candidate-shadow-worker/);
  assert.match(result.docker, /control-rollback/);
  assert.match(result.docker, /market-radar-rollback\/wp-g0-2-candidate-activation/);
  assert.equal(result.head, "b".repeat(40));
});

test("isolated image build failure restores git before control starts", async () => {
  const result = await scenario({ failBuild: true });
  assert.equal(result.environment, result.originalEnv);
  assert.match(result.docker, /build web candidate-shadow-worker/);
  assert.doesNotMatch(result.docker, /control-start|control-rollback/);
  assert.equal(result.head, "b".repeat(40));
});
