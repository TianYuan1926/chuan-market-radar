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

async function scenario({ scannerStatus = "healthy" } = {}) {
  const directory = await mkdtemp("/tmp/wp_g0_2_rehearsal_candidate_activation_observer_");
  const source = join(directory, "source");
  const production = join(directory, "production");
  const secure = join(directory, "secure");
  const ops = join(directory, "ops");
  const fakeBin = join(directory, "bin");
  const counter = join(directory, "counter");
  const rollbackMarker = join(directory, "rollback-marker");
  const approvedCommit = "a".repeat(40);
  const releaseId = "candidate-shadow-observer-rehearsal";
  const approvalIssuedAt = new Date(Date.now() - 60_000).toISOString();
  const approvalExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  await Promise.all([source, production, secure, ops, fakeBin].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  for (const file of [
    ...contract.runnerArtifact.files,
    "docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json",
  ]) {
    await mkdir(dirname(join(source, file)), { recursive: true });
    await copyFile(join(process.cwd(), file), join(source, file));
  }
  await writeFile(join(source, "scripts", "production", "candidate-activation", "production-runner.sh"), [
    "#!/bin/sh",
    "[ \"$CANDIDATE_ACTIVATION_MODE\" = automatic_rollback ] || exit 9",
    "printf rollback > \"$FAKE_ROLLBACK_MARKER\"",
    "",
  ].join("\n"));
  await writeFile(join(production, ".env"), "POSTGRES_DB=market_radar\n", { mode: 0o600 });
  await writeFile(join(production, ".env.production"), "CANDIDATE_EPISODE_SHADOW_WRITE=true\n", { mode: 0o600 });
  const request = {
    approvalDigest: `sha256:${"d".repeat(64)}`,
    approvalExpiresAt,
    approvalIssuedAt,
    approvalRef: "candidate-observer-rehearsal",
    approvedActivationArtifactSha256: "c".repeat(64),
    approvedCommit,
    approvedRunnerArtifactSha256: contract.runnerArtifact.sha256,
    autonomyAuthorization: {
      schemaVersion: "market-radar-package-authorization.v1",
      packageId: "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE",
      actionClass: "candidate_shadow_activation",
      riskTier: "R2_REVERSIBLE_RUNTIME_AND_CONTROL",
      approvalId: "candidate-observer-rehearsal-id",
      nonce: "candidate-observer-rehearsal-nonce",
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
    rollbackCommit: "b".repeat(40),
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
  await writeFile(counter, "0\n");

  const fakeGit = [
    "#!/usr/bin/env node",
    "if (process.argv.includes('rev-parse')) console.log(process.env.FAKE_APPROVED_COMMIT);",
    "",
  ].join("\n");
  const fakeDocker = [
    "#!/usr/bin/env node",
    "const fs=require('fs'); const args=process.argv.slice(2); const joined=args.join(' ');",
    "if (args[0]==='ps') process.exit(0);",
    "if (args[0]==='inspect' && joined.includes('{{.Image}}')) { console.log('sha256:web'); process.exit(0); }",
    "if (args[0]==='inspect' && joined.includes('NetworkSettings.Networks')) { console.log('rehearsal-network'); process.exit(0); }",
    "if (args.includes('compose') && joined.includes('ps -q web')) { console.log('web-container'); process.exit(0); }",
    "if (args.includes('compose') && joined.includes('exec -T postgres')) {",
    "  const count=Number(fs.readFileSync(process.env.FAKE_COUNTER,'utf8').trim())+1; fs.writeFileSync(process.env.FAKE_COUNTER,String(count));",
    "  console.log(JSON.stringify({status:'pass',databaseNow:new Date(Date.parse('2026-07-12T00:00:00Z')+count*300000).toISOString(),identityErrors:0,lockWaiters:0,longTransactions:0})); process.exit(0);",
    "}",
    "if (args.includes('compose') && joined.includes('exec -T')) {",
    "  fs.readFileSync(0); const commit=args[args.indexOf('-e')+1].split('=')[1];",
    "  const release=args[args.lastIndexOf('-e')+1].split('=')[1];",
    "  const workers=['scanner-worker','websocket-light-worker','coinglass-worker','signal-worker','dynamic-scan-scheduler','macro-worker','candidate-shadow-worker'].map(key=>({key,status:key==='scanner-worker'?process.env.FAKE_SCANNER_STATUS:'healthy',ageSec:5}));",
    "  console.log(JSON.stringify({schemaVersion:'candidate-shadow-observation-sample.v1',commit,releaseId:release,health:{ok:true,level:'ready',scanFreshness:'fresh',databaseStatus:'ready',redisStatus:'healthy',workers},candidate:{ok:true,mode:'active',runtime:{enabled:true,blockers:[],authorityEpoch:1,expectedReleaseId:release},monitor:{status:'ready',phase:'shadow_capture',authorityEpoch:1,blockers:[],warnings:[],metrics:{outboxRetryWaitTotal:0,unresolvedQuarantineTotal:0,outboxQuarantinedTotal:0,oldestPendingAgeSeconds:null,outboxCompletedTotal:1}}}})); process.exit(0);",
    "}",
    "process.exit(0);",
    "",
  ].join("\n");
  await writeFile(join(fakeBin, "git"), fakeGit);
  await writeFile(join(fakeBin, "docker"), fakeDocker);
  await chmod(join(fakeBin, "git"), 0o755);
  await chmod(join(fakeBin, "docker"), 0o755);

  try {
    let result;
    try {
      result = await execFileAsync("/bin/bash", [
        join(source, "scripts/production/candidate-activation/observation-runner.sh"),
      ], {
      cwd: production,
      env: {
        ...process.env,
        BASE_ENV_FILE: join(production, ".env"),
        CONFIRM_CANDIDATE_OBSERVATION: "true",
        ENV_FILE: join(production, ".env.production"),
        FAKE_APPROVED_COMMIT: approvedCommit,
        FAKE_COUNTER: counter,
        FAKE_ROLLBACK_MARKER: rollbackMarker,
        FAKE_SCANNER_STATUS: scannerStatus,
        OBSERVATION_REHEARSAL_INTERVAL_SECONDS: "1",
        OBSERVATION_REHEARSAL_SAMPLE_LIMIT: "3",
        OPS_ROOT: ops,
        PATH: fakeBin + ":" + process.env.PATH,
        ROOT_DIR_OVERRIDE: production,
        REQUEST_FILE: join(secure, "request.json"),
        SECURE_ROOT: secure,
      },
      maxBuffer: 2 * 1024 * 1024,
      });
      result.failed = false;
    } catch (error) {
      result = { failed: true, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    const sampleText = await readFile(join(ops, "evidence", "observation-samples.jsonl"), "utf8").catch(() => "");
    return {
      ...result,
      rollback: await readFile(rollbackMarker, "utf8").catch(() => ""),
      samples: sampleText.trim() === "" ? [] : sampleText.trim().split("\n").map((line) => JSON.parse(line)),
      closeout: await readFile(join(ops, "evidence-retained", "observation-closeout.json"), "utf8").then(JSON.parse).catch(() => null),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("observation runner collects and validates isolated samples without phase advance", async () => {
  const result = await scenario();
  assert.equal(result.failed, false);
  assert.match(result.stdout, /PASS_REHEARSAL_OBSERVER_CONTROL_FLOW_ONLY/);
  assert.equal(result.samples.length, 3);
  assert.equal(result.samples.every((sample) => sample.candidate.mode === "active"), true);
  assert.doesNotMatch(result.stdout + result.stderr, /PASS_ACTIVATE_AND_OBSERVE/);
  assert.equal(result.rollback, "");
});

test("observation hard-stop invokes automatic rollback when a required worker is unhealthy", async () => {
  const result = await scenario({ scannerStatus: "degraded" });
  assert.equal(result.failed, true);
  assert.match(result.stderr, /sample_worker_not_healthy:scanner-worker/);
  assert.match(result.stderr, /invoking pre-approved automatic rollback/);
  assert.equal(result.rollback, "rollback");
  assert.equal(result.closeout?.outcome, "ROLLBACK");
  assert.equal(result.samples.length, 0);
});
