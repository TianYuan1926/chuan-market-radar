import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { loadContract } from "./candidate-dormant-deploy.mjs";

const execFileAsync = promisify(execFile);

test("isolated execute rehearsal stays web-only and rolls back a failed verification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-dormant-execute-"));
  const fakeBin = join(directory, "bin");
  const targetRoot = join(directory, "production");
  const gitState = join(directory, "git-state");
  const gitLog = join(directory, "git.log");
  const dockerLog = join(directory, "docker.log");
  const approvedCommit = "a".repeat(40);
  const contract = await loadContract();
  const rollbackCommit = contract.releaseBoundary.lastVerifiedProductionRollbackCommit;
  const releaseDiff = (await execFileAsync("git", [
    "diff",
    "--name-status",
    "--no-renames",
    `${contract.releaseBoundary.lastVerifiedProductionRollbackCommit}..${contract.releaseBoundary.requiredBaseCommit}`,
  ])).stdout;
  const now = Date.now();
  const request = {
    approvalExpiresAt: new Date(now + 30 * 60_000).toISOString(),
    approvalIssuedAt: new Date(now - 60_000).toISOString(),
    approvalRef: "isolated-execute-rehearsal",
    approvedArtifactSha256: contract.artifact.sha256,
    approvedCommit,
    approvedReleaseDiffFileCount: contract.releaseBoundary.releaseDiffFileCount,
    approvedReleaseDiffSha256: contract.releaseBoundary.releaseDiffSha256,
    automaticWebRollbackAllowed: true,
    candidateControlLifecycleStartAllowed: false,
    candidateDatabaseUrlConfigurationAllowed: false,
    candidateFeatureFlagEnablementAllowed: false,
    candidateWorkerStartAllowed: false,
    codeActivationAllowed: false,
    databaseMutationAllowed: false,
    deploymentMode: "dormant_runtime_web_only",
    execute: true,
    migrationAllowed: false,
    operator: "isolated-rehearsal",
    packageId: contract.packageId,
    rollbackCommit: contract.releaseBoundary.lastVerifiedProductionRollbackCommit,
    services: ["web"],
  };

  let healthLevel = "ready";
  const server = createServer((incoming, response) => {
    response.setHeader("content-type", "application/json");
    if (incoming.url === "/api/health") {
      response.end(JSON.stringify({
        ok: true,
        health: {
          dataSource: { activeSource: "isolated-rehearsal" },
          level: healthLevel,
          persistence: { databaseStatus: "ready" },
          runtimeProbes: { redis: { status: "ready" }, workers: [] },
          scan: { freshness: "fresh" },
        },
      }));
      return;
    }
    if (incoming.url === "/api/frontend/radar-contract") {
      response.end(JSON.stringify({
        ok: true,
        contract: {
          coreChainGovernance: { status: "ready" },
          radarSignals: { status: "ready" },
          scanProof: { status: "ready" },
        },
      }));
      return;
    }
    if (incoming.url === "/api/radar/backend-contract") {
      response.end(JSON.stringify({ ok: true, contract: { scanProof: {} } }));
      return;
    }
    if (incoming.url === "/api/radar/business-capability") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  try {
    await mkdir(fakeBin, { recursive: true });
    await mkdir(join(targetRoot, "scripts", "verify"), { recursive: true });
    await copyFile(
      "scripts/verify/production-check.sh",
      join(targetRoot, "scripts", "verify", "production-check.sh"),
    );
    await writeFile(
      join(targetRoot, ".env"),
      "CANDIDATE_EPISODE_SHADOW_WRITE=false\n",
      { mode: 0o600 },
    );
    await writeFile(join(targetRoot, ".env.production"), [
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
    ].join("\n"), { mode: 0o600 });
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify(request),
      { mode: 0o600 },
    );
    await writeFile(gitState, rollbackCommit + "\n");
    await writeFile(gitLog, "");
    await writeFile(dockerLog, "");
    const gitDiffFile = join(directory, "git-diff.txt");
    await writeFile(gitDiffFile, releaseDiff);

    const fakeGit = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "let args = process.argv.slice(2);",
      "let cwd = process.cwd();",
      "if (args[0] === '-C') { cwd = args[1]; args = args.slice(2); }",
      "fs.appendFileSync(process.env.FAKE_GIT_LOG, cwd + '|' + args.join(' ') + '\\n');",
      "if (args[0] === 'status') process.exit(0);",
      "if (args[0] === 'branch' && args[1] === '--show-current') { console.log('main'); process.exit(0); }",
      "if (args[0] === 'branch' && args[1] === '-f') { fs.writeFileSync(process.env.FAKE_GIT_STATE, args[3] + '\\n'); process.exit(0); }",
      "if (args[0] === 'checkout' && args[1] === '--detach') { fs.writeFileSync(process.env.FAKE_GIT_STATE, args[2] + '\\n'); process.exit(0); }",
      "if (args[0] === 'checkout') process.exit(0);",
      "if (args[0] === 'fetch') process.exit(0);",
      "if (args[0] === 'merge-base') process.exit(0);",
      "if (args[0] === 'diff') { process.stdout.write(fs.readFileSync(process.env.FAKE_GIT_DIFF_FILE, 'utf8')); process.exit(0); }",
      "if (args[0] === 'merge') { fs.writeFileSync(process.env.FAKE_GIT_STATE, process.env.FAKE_APPROVED_COMMIT + '\\n'); process.exit(0); }",
      "if (args[0] === 'rev-parse' && args[1] === 'origin/main') { console.log(process.env.FAKE_APPROVED_COMMIT); process.exit(0); }",
      "if (args[0] === 'rev-parse' && args[1] === 'HEAD') {",
      "  console.log(cwd === process.env.FAKE_SOURCE_ROOT ? process.env.FAKE_APPROVED_COMMIT : fs.readFileSync(process.env.FAKE_GIT_STATE, 'utf8').trim());",
      "  process.exit(0);",
      "}",
      "process.exit(0);",
      "",
    ].join("\n");
    const fakeDocker = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "const joined = args.join(' ');",
      "fs.appendFileSync(process.env.FAKE_DOCKER_LOG, joined + '\\n');",
      "if (args[0] === 'ps' || args[0] === 'tag') process.exit(0);",
      "if (args[0] !== 'compose') process.exit(0);",
      "if (joined.includes('images -q web')) console.log('sha256:isolated-old-web-image');",
      "if (joined.includes('exec -T web node')) { fs.readFileSync(0); console.log(JSON.stringify({ candidateAdminMode: 'dormant' })); }",
      "if (joined.includes('exec -T redis')) console.log('PONG');",
      "if (joined.includes('exec -T shadow-runner')) console.log(JSON.stringify({ status: 'ready' }));",
      "process.exit(0);",
      "",
    ].join("\n");
    await writeFile(join(fakeBin, "git"), fakeGit);
    await writeFile(join(fakeBin, "docker"), fakeDocker);
    await chmod(join(fakeBin, "git"), 0o755);
    await chmod(join(fakeBin, "docker"), 0o755);

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");

    const runnerEnv = {
      ...process.env,
      BASE_ENV_FILE: join(targetRoot, ".env"),
      BASE_URL: "http://127.0.0.1:" + address.port,
      CONFIRM_DORMANT_DEPLOY: "true",
      DORMANT_DEPLOY_MODE: "production_deploy",
      ENV_FILE: join(targetRoot, ".env.production"),
      FAKE_APPROVED_COMMIT: approvedCommit,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_GIT_LOG: gitLog,
      FAKE_GIT_DIFF_FILE: gitDiffFile,
      FAKE_GIT_STATE: gitState,
      FAKE_SOURCE_ROOT: process.cwd(),
      PATH: fakeBin + ":" + process.env.PATH,
      READY_TIMEOUT_SECONDS: "0",
      REQUEST_FILE: join(directory, "request.json"),
      ROOT_DIR_OVERRIDE: targetRoot,
    };
    const runRunner = () => execFileAsync("/bin/bash", [
      "scripts/production/candidate-dormant-deploy.sh",
    ], {
      cwd: process.cwd(),
      env: runnerEnv,
      maxBuffer: 2 * 1024 * 1024,
    });
    const { stdout } = await runRunner();

    assert.match(
      stdout,
      /PASS_IMMEDIATE_DORMANT_WEB_CHECKS_AWAITING_DB_VERIFY_AND_OBSERVATION/,
    );
    assert.equal((await readFile(gitState, "utf8")).trim(), approvedCommit);
    const dockerCalls = await readFile(dockerLog, "utf8");
    const envOrder = [
      "--env-file",
      join(targetRoot, ".env"),
      "--env-file",
      join(targetRoot, ".env.production"),
    ].join(" ");
    assert.equal(dockerCalls.includes(envOrder + " images -q web"), true);
    assert.equal(dockerCalls.includes(envOrder + " build web"), true);
    assert.equal(dockerCalls.includes(envOrder + " up -d --no-deps web"), true);
    assert.doesNotMatch(
      dockerCalls,
      /candidate-shadow-worker|--profile|--remove-orphans/,
    );
    assert.equal(
      (await readFile(gitLog, "utf8")).includes("merge --ff-only " + approvedCommit),
      true,
    );

    healthLevel = "degraded";
    await writeFile(gitState, rollbackCommit + "\n");
    await writeFile(gitLog, "");
    await writeFile(dockerLog, "");
    await assert.rejects(runRunner);
    assert.equal((await readFile(gitState, "utf8")).trim(), rollbackCommit);
    const rollbackDockerCalls = await readFile(dockerLog, "utf8");
    assert.equal(
      rollbackDockerCalls.includes(
        "tag chuan-market-radar-web:dormant-rollback-" + rollbackCommit.slice(0, 12)
          + " chuan-market-radar-web:latest",
      ),
      true,
    );
    assert.equal(
      rollbackDockerCalls.includes(envOrder + " up -d --no-deps --force-recreate web"),
      true,
    );
    assert.doesNotMatch(
      rollbackDockerCalls,
      /candidate-shadow-worker|--profile|--remove-orphans/,
    );
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
