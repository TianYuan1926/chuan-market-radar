import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import contract from "../../../docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json" with { type: "json" };

const execFileAsync = promisify(execFile);

async function scenario({ failVerification = false } = {}) {
  const directory = await mkdtemp("/tmp/wp_g0_2_rehearsal_runtime_identity_runner_");
  const fakeBin = join(directory, "bin");
  const production = join(directory, "production");
  const secure = join(directory, "secure");
  const dockerLog = join(directory, "docker.log");
  const approvedCommit = "a".repeat(40);
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
  await writeFile(join(production, ".env"), "POSTGRES_DB=market_radar\n", { mode: 0o600 });
  await writeFile(join(production, ".env.production"), originalEnv, { mode: 0o600 });
  await writeFile(join(production, "scripts", "verify", "production-check.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(join(production, "scripts", "verify", "production-check.sh"), 0o755);
  await writeFile(dockerLog, "");

  const request = {
    approvalExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    approvalIssuedAt: new Date(Date.now() - 60_000).toISOString(),
    approvalRef: "isolated-runtime-identity",
    approvedArtifactSha256: contract.artifact.sha256,
    approvedCommit,
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
    dormantDeployStatus: "PASS_DORMANT_RUNTIME_DEPLOY",
    environmentMutationAllowed: true,
    execute: true,
    migrationAllowed: false,
    operator: "isolated-rehearsal",
    packageId: contract.packageId,
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
  await writeFile(join(secure, "dormant-deploy-result.json"), JSON.stringify({
    candidateDatabaseUrlsConfigured: 0,
    candidateFeatureFlagsEnabled: 0,
    productionCommit: approvedCommit,
    completedAt: new Date().toISOString(),
    status: "PASS_DORMANT_RUNTIME_DEPLOY",
  }), { mode: 0o600 });

  const fakeGit = [
    "#!/usr/bin/env node",
    "const args = process.argv.slice(2);",
    "if (args.includes('status')) process.exit(0);",
    "if (args.includes('branch')) { console.log('main'); process.exit(0); }",
    "if (args.includes('rev-parse')) { console.log(process.env.FAKE_APPROVED_COMMIT); process.exit(0); }",
    "process.exit(0);",
    "",
  ].join("\n");
  const fakeDocker = [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2); const joined = args.join(' ');",
    "fs.appendFileSync(process.env.FAKE_DOCKER_LOG, joined + '\\n');",
    "if (args[0] === 'ps') process.exit(0);",
    "if (args[0] === 'inspect' && joined.includes('{{.Image}}')) { console.log('sha256:old-web'); process.exit(0); }",
    "if (args[0] === 'inspect' && joined.includes('NetworkSettings.Networks')) { console.log('rehearsal-network'); process.exit(0); }",
    "if (args[0] === 'tag') process.exit(0);",
    "if (args[0] === 'run') { console.log(JSON.stringify({status:'pass',secretsPrinted:false})); process.exit(0); }",
    "if (args[0] === 'compose' && joined.includes('ps -q web')) { console.log('web-container'); process.exit(0); }",
    "if (args[0] === 'compose' && joined.includes('up -d --no-deps --no-build --force-recreate web')) process.exit(0);",
    "if (args[0] === 'compose' && joined.includes('exec -T web node -')) { fs.readFileSync(0); process.exit(process.env.FAIL_VERIFY === 'true' ? 7 : 0); }",
    "process.exit(0);",
    "",
  ].join("\n");
  await writeFile(join(fakeBin, "git"), fakeGit);
  await writeFile(join(fakeBin, "docker"), fakeDocker);
  await chmod(join(fakeBin, "git"), 0o755);
  await chmod(join(fakeBin, "docker"), 0o755);

  const env = {
    ...process.env,
    BASE_ENV_FILE: join(production, ".env"),
    BASE_URL: "http://127.0.0.1",
    CONFIRM_RUNTIME_IDENTITY: "true",
    FAIL_VERIFY: String(failVerification),
    FAKE_APPROVED_COMMIT: approvedCommit,
    FAKE_DOCKER_LOG: dockerLog,
    OPS_ROOT: directory,
    PATH: fakeBin + ":" + process.env.PATH,
    ROOT_DIR_OVERRIDE: production,
    RUNTIME_IDENTITY_MODE: "production_identity",
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
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("isolated runner configures only three URLs and keeps web-only dormant scope", async () => {
  const result = await scenario();
  assert.match(result.environment, /CANDIDATE_SOURCE_DATABASE_URL="postgresql:/);
  assert.match(result.environment, /CANDIDATE_EPISODE_SHADOW_WRITE=false/);
  assert.match(result.dockerCalls, /runner\.mjs provision/);
  assert.match(result.dockerCalls, /up -d --no-deps --no-build --force-recreate web/);
  assert.doesNotMatch(result.dockerCalls, /candidate-shadow-worker|--profile|--remove-orphans/);
});

test("isolated runner restores env web and database identities after verification failure", async () => {
  const result = await scenario({ failVerification: true });
  assert.equal(result.environment, result.originalEnv);
  assert.match(result.dockerCalls, /runner\.mjs rollback/);
  assert.match(result.dockerCalls, /runtime-identity-rollback/);
  assert.doesNotMatch(result.dockerCalls, /candidate-shadow-worker|--profile|--remove-orphans/);
});
