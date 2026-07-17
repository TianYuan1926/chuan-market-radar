import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  chmod, mkdtemp, mkdir, readFile, rm, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { sha256 } from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const BASELINE = "54837d03d0fb91b33cf9919bd25ab7aaad60dd7e";
const TARGET = "eb48827b8b403452328b65dc4b415c3fc0ecf765";
const OLD_WEB = `sha256:${"1".repeat(64)}`;
const NEW_WEB = `sha256:${"3".repeat(64)}`;
const WORKER_IMAGE = `sha256:${"2".repeat(64)}`;
const WORKER_CONTAINER = "abc123def456";

async function executable(path, source) {
  await writeFile(path, source, { mode: 0o700 });
  await chmod(path, 0o700);
}

async function runScript(path, env) {
  return new Promise((resolveResult) => {
    const child = spawn("/bin/bash", [path], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}

async function rehearsal({ failBuild = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "shadow-verify-release-execute-"));
  const app = join(root, "app");
  const fakeBin = join(root, "bin");
  const state = join(root, "web-state");
  const retention = join(root, "rollback-retained");
  const mutations = join(root, "mutations.log");
  const trustRoot = join(root, "trust-root");
  const evidenceOutput = join(root, "evidence-output");
  await mkdir(fakeBin);
  await mkdir(trustRoot);
  await execFileAsync("git", ["clone", "--shared", "--no-checkout", process.cwd(), app]);
  await execFileAsync("git", ["checkout", "--detach", BASELINE], { cwd: app });
  await writeFile(state, "old\n");
  await writeFile(mutations, "");

  const baseEnv = join(root, "base.env");
  const productionEnv = join(root, "production.env");
  const identityOverride = join(root, "identity.yml");
  const identityWrapper = join(root, "compose-wrapper");
  const lineage = join(root, "lineage.json");
  const reconciliation = join(root, "reconciliation.json");
  const requestPath = join(root, "approval-request.json");
  const manifestPath = join(root, "transport-manifest.json");
  await writeFile(baseEnv, "BASE=redacted\n", { mode: 0o600 });
  await writeFile(productionEnv, "PRODUCTION=redacted\n", { mode: 0o600 });
  await writeFile(identityOverride, "services: {}\n", { mode: 0o600 });
  await writeFile(lineage, "{\"status\":\"PASS\"}\n", { mode: 0o600 });
  await writeFile(reconciliation, "{\"status\":\"PASS\"}\n", { mode: 0o600 });
  await writeFile(manifestPath, "{}\n", { mode: 0o600 });

  await executable(identityWrapper, `#!/usr/bin/env bash
set -euo pipefail
while [[ "\${1:-}" == "--env-file" ]]; do shift 2; done
command_name="\${1:-}"; shift || true
case "\${command_name}" in
  ps)
    [[ "$*" == "-q web" ]] || exit 2
    [[ "$(tr -d '\\n' < "$FAKE_STATE")" == "new" ]] && echo web-new || echo web-old
    ;;
  build)
    [[ "$*" == "web" ]] || exit 2
    printf 'build:web\\n' >> "$FAKE_MUTATIONS"
    [[ "\${FAIL_BUILD:-false}" != "true" ]] || exit 42
    ;;
  up)
    [[ "$*" == "-d --no-deps --no-build --force-recreate web" ]] || exit 2
    if [[ "$(git -C "$APP_ROOT" rev-parse HEAD)" == "$TARGET_COMMIT" ]]; then
      printf 'new\\n' > "$FAKE_STATE"
      printf 'up:web:new\\n' >> "$FAKE_MUTATIONS"
    else
      printf 'old\\n' > "$FAKE_STATE"
      printf 'up:web:old\\n' >> "$FAKE_MUTATIONS"
    fi
    ;;
  *) exit 2 ;;
esac
`);

  await executable(join(fakeBin, "docker"), `#!/usr/bin/env bash
set -euo pipefail
command_name="\${1:-}"; shift || true
web_state="$(tr -d '\\n' < "$FAKE_STATE")"
case "$command_name" in
  ps)
    if [[ "$*" == *"candidate-shadow-worker"* ]]; then
      echo "$WORKER_CONTAINER"
    else
      [[ "$web_state" == "new" ]] && web_id=web-new || web_id=web-old
      printf 'chuan-market-radar-web-1=market-radar-web:latest=%s\\n' "$web_id"
      printf 'chuan-market-radar-candidate-shadow-worker-1=candidate-worker:latest=$WORKER_CONTAINER\\n'
      printf 'chuan-market-radar-scanner-worker-1=scanner-worker:latest=scanner123456\\n'
      printf 'chuan-market-radar-postgres-1=postgres:16=postgres12345\\n'
    fi
    ;;
  inspect)
    object="\${1:-}"
    if [[ "$*" == *"{{.Config.Image}}"* ]]; then
      echo market-radar-web:latest
    elif [[ "$object" == "$WORKER_CONTAINER" ]]; then
      echo "$WORKER_IMAGE"
    elif [[ "$object" == "web-new" ]]; then
      echo "$NEW_WEB"
    else
      echo "$OLD_WEB"
    fi
    ;;
  image)
    [[ "\${1:-}" == "inspect" ]] || exit 2
    [[ -f "$FAKE_RETENTION" ]] && echo "$OLD_WEB" || exit 1
    ;;
  tag)
    source_ref="\${1:-}"; target_ref="\${2:-}"
    if [[ "$target_ref" == market-radar-rollback/* ]]; then
      [[ "$source_ref" == "$OLD_WEB" ]] || exit 2
      printf 'retained\\n' > "$FAKE_RETENTION"
      printf 'tag:rollback\\n' >> "$FAKE_MUTATIONS"
    else
      [[ "$source_ref" == market-radar-rollback/* ]] || exit 2
      printf 'tag:restore\\n' >> "$FAKE_MUTATIONS"
    fi
    ;;
  exec)
    [[ "\${1:-}" == "-i" ]] && shift
    container="\${1:-}"; shift || true
    if [[ "\${1:-}" == "test" ]]; then exit 0; fi
    script="$(cat)"
    if [[ "$script" == *"candidate_migration_control"* ]]; then
      printf '%s' '{"migration_id":"candidate-episode-v1-cycle-2","phase":"shadow_capture","epoch":1,"write_frozen":false,"approved_release_id":"candidate-shadow-fresh-cycle-two"}'
    fi
    ;;
  *) exit 2 ;;
esac
`);

  await executable(join(fakeBin, "curl"), `#!/usr/bin/env bash
printf '%s\\n' '{"ok":true,"health":{"level":"ready","persistence":{"databaseStatus":"ready"},"scan":{"freshness":"fresh"},"runtimeProbes":{"workers":[{"name":"candidate-shadow-worker","status":"healthy"},{"name":"scanner-worker","status":"healthy"}]}}}'
`);

  await executable(join(fakeBin, "node"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${2:-}" == "acquire" ]]; then
  execution=""
  previous=""
  for value in "$@"; do
    [[ "$previous" == "--execution" ]] && execution="$value"
    previous="$value"
  done
  printf '%s\\n' '{"schemaVersion":"market-radar-production-lease-execution.v1","leaseId":"rehearsal","fencingToken":1}' > "$execution"
fi
printf '%s\\n' '{"status":"pass","leaseId":"rehearsal","fencingToken":1}'
`);

  const composeSha256 = sha256(await readFile(join(app, "docker-compose.yml")));
  const request = {
    packageId: "WP-G0.2-SHADOW-VERIFY-CODE-AUTHORIZATION-PRODUCTION-RELEASE",
    releaseBaselineCommit: BASELINE,
    releaseTargetCommit: TARGET,
    releaseTargetTree: "a02f989b1be653d4524d1b6dd73995dabeb73f3d",
    releaseTargetBranch: "codex/wp-g0-2-shadow-verify-web-release",
    releaseDiffSha256: "85ca52281f50a41f86bf27be90d9beabe19e32c37421b9ab19a0057fb2b19113",
    releasePathSetSha256: "1184a4dff040f0aa918f4e5f77095721d8221eefdbc92930c05e53fcb62442e5",
    baseEnvPath: baseEnv,
    baseEnvSha256: sha256(await readFile(baseEnv)),
    productionEnvPath: productionEnv,
    productionEnvSha256: sha256(await readFile(productionEnv)),
    identityOverridePath: identityOverride,
    identityOverrideSha256: sha256(await readFile(identityOverride)),
    identityWrapperPath: identityWrapper,
    identityWrapperSha256: sha256(await readFile(identityWrapper)),
    composeSha256,
    currentWebImageId: OLD_WEB,
    candidateWorkerContainerId: WORKER_CONTAINER,
    candidateWorkerImageId: WORKER_IMAGE,
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-shadow-verify-code:web-${"1".repeat(16)}`,
    evidenceDirectory: evidenceOutput,
    autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
    lineageEvidencePath: lineage,
    lineageEvidenceSha256: sha256(await readFile(lineage)),
    reconciliationEvidencePath: reconciliation,
    reconciliationEvidenceSha256: sha256(await readFile(reconciliation)),
    candidateMigrationId: "candidate-episode-v1-cycle-2",
    candidateReleaseId: "candidate-shadow-fresh-cycle-two",
    candidateAuthorityEpoch: 1,
    autonomyAuthorization: { approvalId: "rehearsal-approval" },
  };
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });

  const result = await runScript(
    resolve("scripts/production/candidate-shadow-verify-release/production-runner.sh"),
    {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      REQUEST_FILE: requestPath,
      ROOT_DIR_OVERRIDE: app,
      TRANSPORT_MANIFEST_OVERRIDE: manifestPath,
      TRUST_ROOT_OVERRIDE: trustRoot,
      SHADOW_VERIFY_RELEASE_REHEARSAL: "true",
      OBSERVATION_DURATION_SECONDS: "0",
      OBSERVATION_POLL_SECONDS: "0",
      WEB_READY_TIMEOUT_SECONDS: "1",
      FAIL_BUILD: failBuild ? "true" : "false",
      FAKE_STATE: state,
      FAKE_RETENTION: retention,
      FAKE_MUTATIONS: mutations,
      APP_ROOT: app,
      TARGET_COMMIT: TARGET,
      WORKER_CONTAINER,
      WORKER_IMAGE,
      OLD_WEB,
      NEW_WEB,
    },
  );
  return {
    ...result,
    root,
    app,
    evidenceOutput,
    mutations: await readFile(mutations, "utf8"),
    state: (await readFile(state, "utf8")).trim(),
  };
}

test("isolated Web-only execution reaches target without changing workers", async () => {
  const result = await rehearsal();
  try {
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY/u);
    assert.equal(result.state, "new");
    assert.match(result.mutations, /tag:rollback/u);
    assert.match(result.mutations, /build:web/u);
    assert.match(result.mutations, /up:web:new/u);
    assert.doesNotMatch(result.mutations, /worker|scanner/u);
    const summary = JSON.parse(await readFile(join(result.evidenceOutput, "summary.json")));
    assert.equal(summary.status, "PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY");
    assert.deepEqual(summary.servicesMutated, ["web"]);
    assert.equal(summary.databaseMutation, false);
    assert.equal(summary.workerMutation, false);
    assert.equal(summary.phaseTransition, false);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test("build failure automatically restores exact baseline Web and Git", async () => {
  const result = await rehearsal({ failBuild: true });
  try {
    assert.notEqual(result.code, 0);
    assert.equal(result.state, "old");
    assert.match(result.stderr, /ROLLBACK_SHADOW_VERIFY_CODE_RELEASE_VERIFIED/u);
    assert.match(result.mutations, /tag:rollback/u);
    assert.match(result.mutations, /tag:restore/u);
    assert.match(result.mutations, /up:web:old/u);
    assert.doesNotMatch(result.mutations, /worker|scanner/u);
    const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: result.app })).stdout.trim();
    assert.equal(head, BASELINE);
    const rollback = JSON.parse(await readFile(join(result.evidenceOutput, "rollback.json")));
    assert.equal(rollback.status, "ROLLBACK_PASS");
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});
