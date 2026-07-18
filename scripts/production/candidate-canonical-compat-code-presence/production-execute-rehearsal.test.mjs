import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod, mkdtemp, mkdir, readFile, rm, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  buildTransportBundle,
  createProductionVerificationRequest,
  validateProductionVerificationRequest,
} from "./bundle.mjs";
import { validateCodePresenceEvidence } from "./runner.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
const repeated = (character, length) => character.repeat(length);

test("isolated execute proves existing code without mutating services", async () => {
  const directory = await mkdtemp(join(tmpdir(), "code-presence-execute-"));
  const worktree = join(directory, "production");
  const fakeDocker = join(directory, "docker");
  const buildRecord = join(directory, "target-images-record.json");
  const health = join(directory, "health.json");
  const staging = join(directory, "staging");
  const requestPath = join(staging, "approval-request.json");
  const manifestPath = join(staging, "transport-manifest.json");
  const evidenceDirectory = join(directory, "evidence");
  const webContainer = repeated("a", 64);
  const webImage = `sha256:${repeated("b", 64)}`;
  const migrationId = "candidate-episode-v1-cycle-5";
  const releaseId = "candidate-shadow-cycle-5-94b6d415";
  const authorityEpoch = 2;
  const manifestRaw = `${JSON.stringify({
    schemaVersion: "candidate-read-authority-manifest.v1",
    migrationId,
    releaseId,
    authorityEpoch,
    phase: "shadow_verify",
    flags: { dualRead: true, canonicalRead: false, reviewRead: false },
  }, null, 2)}\n`;
  const apiRaw = JSON.stringify({
    httpStatus: 200,
    ok: true,
    mode: "dual_read_legacy_authority",
    readSource: "legacy",
    authority: "legacy_projection_non_authoritative",
    parityStatus: "pass",
    differenceCount: 0,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    automaticPhaseAdvance: false,
  });
  const sourceIdentity = {
    sourceCommit: repeated("d", 40),
    sourceTree: repeated("e", 40),
    sourceParentCommit: repeated("f", 40),
    runnerArtifactSha256: repeated("1", 64),
    contractSha256: repeated("2", 64),
  };
  let worktreeAdded = false;
  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktree,
      "94b6d415573f5d8b2d0190c809a4b8e128a25aa8"], { cwd: root });
    worktreeAdded = true;
    await writeFile(fakeDocker, `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "ps" && "$2" == "--filter" ]]; then echo '${webContainer}'; exit 0; fi
if [[ "$1" == "inspect" ]]; then echo '${webImage}'; exit 0; fi
if [[ "$1" == "exec" && "$3" == "cat" ]]; then printf '%s' '${manifestRaw}'; exit 0; fi
if [[ "$1" == "exec" && "$2" == "-i" ]]; then cat >/dev/null || true; printf '%s\n' '${apiRaw}'; exit 0; fi
if [[ "$1" == "ps" && "$2" == "--format" ]]; then
  echo 'chuan-market-radar-web-1=web=${webContainer}'
  echo 'chuan-market-radar-candidate-shadow-worker-1=worker=cccccccccccc'
  exit 0
fi
exit 2
`, { mode: 0o700 });
    await chmod(fakeDocker, 0o700);
    await writeFile(buildRecord, `${JSON.stringify({
      schemaVersion: "candidate-cycle-target-images.v1",
      webTargetId: webImage,
      workerImageId: `sha256:${repeated("3", 64)}`,
      secretsPrinted: false,
    }, null, 2)}\n`, { mode: 0o600 });
    await writeFile(health, `${JSON.stringify({
      ok: true,
      health: {
        level: "ready",
        scan: { freshness: "fresh" },
        persistence: { databaseStatus: "ready" },
        runtimeProbes: { workers: [{ name: "candidate-shadow-worker", status: "healthy" }] },
      },
    })}\n`, { mode: 0o600 });
    const transport = await buildTransportBundle({
      root,
      output: join(directory, "transport.tar.gz"),
      sourceIdentity,
    });
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await execFileAsync("tar", ["-xzf", transport.output, "-C", staging]);
    const manifest = transport.manifest;
    const bundleSha256 = transport.sha256;
    const buildRecordBytes = await readFile(buildRecord);
    const { createHash } = await import("node:crypto");
    const manifestSha256 = createHash("sha256").update(manifestRaw).digest("hex");
    const request = createProductionVerificationRequest({
      bundleSha256,
      manifest,
      now: new Date(),
      nonce: "12345678-1234-4123-8123-123456789abc",
      runtime: {
        buildRecordSha256: createHash("sha256").update(buildRecordBytes).digest("hex"),
        buildRecordWebImageId: webImage,
        currentWebContainerId: webContainer,
        currentWebImageId: webImage,
        migrationId,
        releaseId,
        authorityEpoch,
        manifestSha256,
        healthLevel: "ready",
        scanFreshness: "fresh",
      },
    });
    validateProductionVerificationRequest(request, manifest, { bundleSha256, now: new Date() });
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    const result = await execFileAsync("bash", [
      join(staging, "scripts/production/candidate-canonical-compat-code-presence/production-runner.sh"),
    ], {
      cwd: root,
      env: {
        ...process.env,
        BUILD_RECORD_PATH_OVERRIDE: buildRecord,
        CANONICAL_COMPAT_CODE_PRESENCE_REHEARSAL: "true",
        DOCKER_BIN_OVERRIDE: fakeDocker,
        EVIDENCE_DIRECTORY_OVERRIDE: evidenceDirectory,
        HEALTH_URL_OVERRIDE: `file://${health}`,
        REQUEST_FILE: requestPath,
        ROOT_DIR_OVERRIDE: worktree,
        TRANSPORT_MANIFEST_OVERRIDE: manifestPath,
      },
    });
    assert.match(result.stdout, /PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED/u);
    const evidence = JSON.parse(await readFile(
      join(evidenceDirectory, "code-presence-evidence.json"), "utf8"));
    validateCodePresenceEvidence(evidence);
    assert.deepEqual(evidence.servicesMutated, []);
    assert.equal(evidence.gitMutation, false);
    assert.equal(evidence.targetWebImageId, webImage);
  } finally {
    if (worktreeAdded) {
      await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: root })
        .catch(() => {});
    }
    await rm(directory, { recursive: true, force: true });
  }
});
