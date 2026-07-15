import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import contract from "../../../docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function scenario({
  failVerification = false,
  nodeRuntime = "host_node",
  readinessFailures = 0,
} = {}) {
  const directory = await mkdtemp("/tmp/wp_g0_2_rehearsal_runtime_identity_runner_");
  const fakeBin = join(directory, "bin");
  const production = join(directory, "production");
  const secure = join(directory, "secure");
  const dockerLog = join(directory, "docker.log");
  const readinessCounter = join(directory, "readiness.counter");
  const approvedProductionCommit = "a".repeat(40);
  const approvedRunnerSourceCommit = "d".repeat(40);
  const identityWrapper = join(directory, "compose-identity-safe");
  const identityOverride = join(directory, "runtime-identity.override.yml");
  const postgresAdminEnv = join(directory, "postgres-admin.env");
  const contractFile = join(directory, "runtime-identity-contract.json");
  const baseEnv = "POSTGRES_DB=market_radar\n";
  const compose = "services:\n  web:\n    image: test\n";
  const originalEnv = [
    "CANDIDATE_SOURCE_DATABASE_URL=",
    "CANDIDATE_CONSUMER_DATABASE_URL=",
    "CANDIDATE_MONITOR_DATABASE_URL=",
    "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
    "CANDIDATE_EPISODE_SHADOW_WRITE=false",
    "CANDIDATE_EPISODE_DUAL_READ=false",
    "CANDIDATE_EPISODE_CANONICAL_READ=false",
    "CANDIDATE_EPISODE_REVIEW_READ=false",
    "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
    "CANDIDATE_SHADOW_WORKER_EXPECTED=false",
  ].join("\n") + "\n";
  await mkdir(fakeBin, { recursive: true });
  await mkdir(join(production, "scripts", "verify"), { recursive: true });
  await mkdir(secure, { recursive: true, mode: 0o700 });
  await writeFile(join(production, ".env"), baseEnv, { mode: 0o600 });
  await writeFile(join(production, ".env.production"), originalEnv, { mode: 0o600 });
  await writeFile(join(production, "docker-compose.yml"), compose, { mode: 0o600 });
  await writeFile(join(production, "scripts", "verify", "production-check.sh"), "#!/bin/sh\nexit 99\n");
  await chmod(join(production, "scripts", "verify", "production-check.sh"), 0o755);
  await writeFile(identityWrapper, "#!/bin/sh\nexec docker compose \"$@\"\n", { mode: 0o700 });
  await writeFile(identityOverride, "services:\n  web:\n    environment:\n      DATABASE_URL: redacted\n", { mode: 0o600 });
  await chmod(identityWrapper, 0o700);
  await chmod(identityOverride, 0o600);
  await writeFile(dockerLog, "");
  await writeFile(readinessCounter, "0");

  const localContract = JSON.parse(JSON.stringify(contract));
  localContract.productionTarget = { commit: approvedProductionCommit, repositoryState: "clean_detached" };
  localContract.productionIdentity = {
    adminEnvMode: "0600",
    adminEnvPath: postgresAdminEnv,
    overrideMode: "0600",
    overridePath: identityOverride,
    overrideSha256: sha256(await readFile(identityOverride)),
    ownerGid: 0,
    ownerUid: 0,
    wrapperMode: "0700",
    wrapperPath: identityWrapper,
    wrapperSha256: sha256(await readFile(identityWrapper)),
  };
  const dormantEvidence = {
    baselineCommit: localContract.dormantEvidence.baselineCommit,
    candidateDormant: true,
    candidateWorkerAbsent: true,
    completedAt: new Date().toISOString(),
    continuousReadyFresh: true,
    databaseMutation: false,
    detachedHead: true,
    environmentMutation: false,
    observationDurationSeconds: 1800,
    otherServiceMutation: false,
    packageId: localContract.dormantEvidence.packageId,
    redisMutation: false,
    rollbackCleanupRequiresSeparateApproval: true,
    rollbackImageRetained: true,
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-dormant:web-${"e".repeat(16)}`,
    sampleCount: 57,
    status: localContract.dormantEvidence.finalStatus,
    targetCommit: approvedProductionCommit,
    webImageId: `sha256:${"f".repeat(64)}`,
  };
  const dormantEvidenceText = JSON.stringify(dormantEvidence);
  localContract.dormantEvidence.summarySha256 = sha256(dormantEvidenceText);
  await writeFile(contractFile, JSON.stringify(localContract), { mode: 0o600 });

  const request = {
    approvalExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    approvalIssuedAt: new Date(Date.now() - 60_000).toISOString(),
    approvalRef: "isolated-runtime-identity",
    approvedArtifactSha256: contract.artifact.sha256,
    approvedProductionCommit,
    approvedRunnerSourceCommit,
    approvedWebImageId: `sha256:${"f".repeat(64)}`,
    automaticDatabaseRollbackAllowed: true,
    automaticEnvironmentRollbackAllowed: true,
    automaticWebRollbackAllowed: true,
    businessDmlAllowed: false,
    candidateControlLifecycleStartAllowed: false,
    candidateDatabaseUrlConfigurationAllowed: true,
    candidateFeatureFlagEnablementAllowed: false,
    candidateWorkerStartAllowed: false,
    codeActivationAllowed: false,
    databaseRoleMutationAllowed: true,
    baseEnvSha256: sha256(baseEnv),
    composeSha256: sha256(compose),
    dormantDeployEvidenceSha256: sha256(dormantEvidenceText),
    dormantDeployStatus: localContract.dormantEvidence.finalStatus,
    environmentMutationAllowed: true,
    execute: true,
    identityOverridePath: identityOverride,
    identityOverrideSha256: localContract.productionIdentity.overrideSha256,
    identityWrapperPath: identityWrapper,
    identityWrapperSha256: localContract.productionIdentity.wrapperSha256,
    migrationAllowed: false,
    operator: "isolated-rehearsal",
    packageId: contract.packageId,
    postgresAdminEnvPath: postgresAdminEnv,
    productionEnvSha256: sha256(originalEnv),
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-runtime-identity:web-${"f".repeat(16)}`,
    runtimeAccessSha256: contract.runtimeAccess.sqlSha256,
    schemaDdlAllowed: false,
    services: ["web"],
    webRecreateAllowed: true,
  };
  const credentials = {
    databaseHost: "postgres",
    databaseName: "market_radar",
    databasePort: 5432,
    environment: "production",
    identities: {
      consumer: { login: "market_radar_candidate_consumer", password: "B".repeat(40) },
      monitor: { login: "market_radar_candidate_monitor", password: "C".repeat(40) },
      source: { login: "market_radar_candidate_source", password: "A".repeat(40) },
    },
    schemaVersion: "candidate-runtime-identity-credentials.v1",
  };
  await writeFile(join(secure, "request.json"), JSON.stringify(request), { mode: 0o600 });
  await writeFile(join(secure, "credentials.json"), JSON.stringify(credentials), { mode: 0o600 });
  await writeFile(join(secure, "role-admin.url"), "postgresql://redacted.invalid/database\n", { mode: 0o600 });
  await writeFile(join(secure, "dormant-deploy-result.json"), dormantEvidenceText, { mode: 0o600 });

  const fakeGit = [
    "#!/usr/bin/env node",
    "const args = process.argv.slice(2);",
    "if (args.includes('status')) process.exit(0);",
    "if (args.includes('branch')) process.exit(0);",
    "if (args.includes('rev-parse')) {",
    "  console.log(args.includes(process.env.FAKE_PRODUCTION_ROOT)",
    "    ? process.env.FAKE_PRODUCTION_COMMIT : process.env.FAKE_RUNNER_SOURCE_COMMIT);",
    "  process.exit(0);",
    "}",
    "process.exit(0);",
    "",
  ].join("\n");
  const fakeDocker = [
    "#!/usr/bin/env node",
    "const fs = require('node:fs'); const { spawnSync } = require('node:child_process');",
    "const args = process.argv.slice(2); const joined = args.join(' ');",
    "fs.appendFileSync(process.env.FAKE_DOCKER_LOG, joined + '\\n');",
    `if (args[0] === 'ps' && joined.includes('com.docker.compose.service=web')) { console.log('${"e".repeat(12)}'); process.exit(0); }`,
    "if (args[0] === 'ps') process.exit(0);",
    `if (args[0] === 'inspect' && joined.includes('{{.Image}}')) { console.log('sha256:${"f".repeat(64)}'); process.exit(0); }`,
    `if (args[0] === 'inspect' && joined.includes('{{.Id}}')) { console.log('${"e".repeat(64)}'); process.exit(0); }`,
    "if (args[0] === 'inspect' && joined.includes('.State.Status')) { console.log('running|healthy'); process.exit(0); }",
    "if (args[0] === 'inspect' && joined.includes('NetworkSettings.Networks')) { console.log('rehearsal-network'); process.exit(0); }",
    `if (args[0] === 'image' && args[1] === 'inspect') { console.log('sha256:${"f".repeat(64)}'); process.exit(0); }`,
    "if (args[0] === 'tag') process.exit(0);",
    "if (args[0] === 'run' && joined.includes('--network none') && joined.includes('--entrypoint node')) {",
    "  const entrypoint = args.indexOf('--entrypoint'); const command = args.slice(entrypoint + 3);",
    "  const result = spawnSync(process.execPath, command, { env: process.env, stdio: 'inherit' });",
    "  process.exit(result.status ?? 1);",
    "}",
    "if (args[0] === 'run') { console.log(JSON.stringify({status:'pass',secretsPrinted:false})); process.exit(0); }",
    `if (args[0] === 'compose' && joined.includes('ps -q web')) { console.log('${"e".repeat(64)}'); process.exit(0); }`,
    "if (args[0] === 'compose' && joined.includes('up -d --no-deps --no-build --force-recreate web')) process.exit(0);",
    "if (args[0] === 'compose' && joined.includes('exec -T web node -e')) {",
    "  const count = Number(fs.readFileSync(process.env.FAKE_READINESS_COUNTER, 'utf8')) + 1;",
    "  fs.writeFileSync(process.env.FAKE_READINESS_COUNTER, String(count));",
    "  process.exit(count <= Number(process.env.READINESS_FAILURES) ? 8 : 0);",
    "}",
    "if (args[0] === 'compose' && joined.includes('exec -T web node -')) { fs.readFileSync(0); process.exit(process.env.FAIL_VERIFY === 'true' ? 7 : 0); }",
    "process.exit(0);",
    "",
  ].join("\n");
  const fakeSha256sum = [
    "#!/usr/bin/env node",
    "const crypto = require('node:crypto'); const fs = require('node:fs');",
    "const file = process.argv.at(-1);",
    "const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');",
    "console.log(hash + '  ' + file);",
    "",
  ].join("\n");
  const fakeSudo = [
    "#!/usr/bin/env node",
    "const crypto = require('node:crypto'); const fs = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    "const args = process.argv.slice(2); if (args[0] === '-n') args.shift();",
    "if (args[0] === 'test') {",
    "  const flag = args[1]; const file = args[2]; let result = false;",
    "  try { result = flag === '-f' ? fs.statSync(file).isFile() : fs.lstatSync(file).isSymbolicLink(); } catch {}",
    "  process.exit(result ? 0 : 1);",
    "}",
    "if (args[0] === 'stat') {",
    "  const format = args[2]; const file = args[3];",
    "  if (format.includes('%u')) console.log('0');",
    "  else console.log((fs.statSync(file).mode & 0o777).toString(8));",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'sha256sum') {",
    "  const file = args[1]; const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');",
    "  console.log(hash + '  ' + file); process.exit(0);",
    "}",
    "const result = spawnSync(args[0], args.slice(1), { env: process.env, stdio: 'inherit' });",
    "process.exit(result.status ?? 1);",
    "",
  ].join("\n");
  await writeFile(join(fakeBin, "git"), fakeGit);
  await writeFile(join(fakeBin, "docker"), fakeDocker);
  await writeFile(join(fakeBin, "sha256sum"), fakeSha256sum);
  await writeFile(join(fakeBin, "sudo"), fakeSudo);
  await chmod(join(fakeBin, "git"), 0o755);
  await chmod(join(fakeBin, "docker"), 0o755);
  await chmod(join(fakeBin, "sha256sum"), 0o755);
  await chmod(join(fakeBin, "sudo"), 0o755);

  const server = createServer((requestMessage, response) => {
    response.setHeader("content-type", "application/json");
    if (requestMessage.url === "/api/health") {
      response.end(JSON.stringify({
        health: {
          dataSource: { activeSource: "production-rehearsal" },
          level: "ready",
          persistence: { databaseStatus: "ready" },
          runtimeProbes: { redis: { status: "healthy" }, workers: [] },
          scan: { freshness: "fresh" },
        },
        ok: true,
      }));
    } else if (requestMessage.url === "/api/frontend/radar-contract") {
      response.end(JSON.stringify({
        contract: { coreChainGovernance: { status: "ready" }, radarSignals: { status: "ready" }, scanProof: { status: "ready" } },
        ok: true,
      }));
    } else if (requestMessage.url === "/api/radar/backend-contract") {
      response.end(JSON.stringify({ contract: { scanProof: { status: "ready" } }, ok: true }));
    } else if (requestMessage.url === "/api/radar/business-capability") {
      response.end(JSON.stringify({ ok: true }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, "object");

  const env = {
    ...process.env,
    BASE_ENV_FILE: join(production, ".env"),
    BASE_URL: `http://127.0.0.1:${serverAddress.port}`,
    CONFIRM_RUNTIME_IDENTITY: "true",
    CONTRACT_FILE_OVERRIDE: contractFile,
    FAIL_VERIFY: String(failVerification),
    FAKE_DOCKER_LOG: dockerLog,
    FAKE_READINESS_COUNTER: readinessCounter,
    FAKE_IDENTITY_OVERRIDE: identityOverride,
    FAKE_IDENTITY_WRAPPER: identityWrapper,
    FAKE_PRODUCTION_COMMIT: approvedProductionCommit,
    FAKE_PRODUCTION_ROOT: production,
    FAKE_RUNNER_SOURCE_COMMIT: approvedRunnerSourceCommit,
    OPS_ROOT: directory,
    PATH: fakeBin + ":" + process.env.PATH,
    ROOT_DIR_OVERRIDE: production,
    RUNTIME_IDENTITY_MODE: "production_identity",
    RUNTIME_IDENTITY_NODE_RUNTIME: nodeRuntime,
    READINESS_FAILURES: String(readinessFailures),
    SECURE_ROOT: secure,
  };
  try {
    const execution = execFileAsync("/bin/bash", [
      "scripts/production/candidate-runtime-identity/production-runner.sh",
    ], { cwd: process.cwd(), env, maxBuffer: 2 * 1024 * 1024 });
    if (failVerification) await assert.rejects(execution);
    else assert.match((await execution).stdout, /PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION/);
    return {
      dockerCalls: await readFile(dockerLog, "utf8"),
      environment: await readFile(join(production, ".env.production"), "utf8"),
      originalEnv,
      readinessAttempts: Number(await readFile(readinessCounter, "utf8")),
    };
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { force: true, recursive: true });
  }
}

test("isolated runner configures only three URLs and keeps web-only dormant scope", async () => {
  const result = await scenario();
  assert.match(result.environment, /CANDIDATE_SOURCE_DATABASE_URL="postgresql:/);
  assert.match(result.environment, /CANDIDATE_EPISODE_SHADOW_WRITE=false/);
  assert.match(result.dockerCalls, /runner\.mjs provision/);
  assert.match(result.dockerCalls, /up -d --no-deps --no-build --force-recreate web/);
  assert.match(result.dockerCalls, /compose --env-file .*\/\.env --env-file .*\/\.env\.production config --services/);
  assert.match(result.dockerCalls, /compose --env-file .*\/\.env --env-file .*\/\.env\.production ps -q web/);
  assert.match(result.dockerCalls, /compose --env-file .*\/\.env --env-file .*\/\.env\.production up -d --no-deps --no-build --force-recreate web/);
  assert.match(result.dockerCalls, /compose --env-file .*\/\.env --env-file .*\/\.env\.production exec -T postgres/);
  assert.doesNotMatch(result.dockerCalls, /candidate-shadow-worker|--profile|--remove-orphans/);
});

test("isolated runner restores env web and database identities after verification failure", async () => {
  const result = await scenario({ failVerification: true });
  assert.equal(result.environment, result.originalEnv);
  assert.match(result.dockerCalls, /runner\.mjs rollback/);
  assert.match(result.dockerCalls, /market-radar-rollback\/wp-g0-2-runtime-identity:web-ffffffffffffffff/);
  assert.match(result.dockerCalls, /image inspect market-radar-rollback\/wp-g0-2-runtime-identity/);
  assert.doesNotMatch(result.dockerCalls, /candidate-shadow-worker|--profile|--remove-orphans/);
});

test("isolated runner waits for Web readiness before the identity probe", async () => {
  const result = await scenario({ readinessFailures: 1 });
  assert.equal(result.readinessAttempts, 2);
  assert.match(result.dockerCalls, /inspect .*\.State\.Status/);
  assert.equal((result.dockerCalls.match(/exec -T web node -e/g) ?? []).length, 2);
});

test("runner uses the approved Web image when the host Node runtime is unavailable", async () => {
  const result = await scenario({ nodeRuntime: "container_node" });
  assert.match(result.environment, /CANDIDATE_MONITOR_DATABASE_URL="postgresql:/);
  assert.match(result.dockerCalls, /--network none --read-only --cap-drop ALL/);
  assert.match(result.dockerCalls, /--security-opt no-new-privileges/);
  assert.match(result.dockerCalls, /sha256:f{64} .*runner\.mjs request/);
  assert.match(result.dockerCalls, /sha256:f{64} .*runner\.mjs render-env/);
});
