import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  validateContract,
  verifyStagedTransport,
} from "./bundle.mjs";
import {
  CHILD_ARCHIVES,
  CHILD_PACKAGES,
  REQUIRED_PRODUCTION_COMMIT,
  SEQUENCE,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);
const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceIdentity = {
  sourceCommit: commit("1"),
  sourceTree: commit("2"),
  sourceParentCommit: commit("3"),
  sourceDiffSha256: hash("4"),
  sourcePathSetSha256: hash("5"),
  gateEvidenceSha256: hash("6"),
};

async function extract(archive, destination) {
  await mkdir(destination, { recursive: true });
  await execFileAsync("tar", ["-xzf", archive, "-C", destination]);
}

test("contract preserves current R0 Code Presence then independent R2 Canonical Compat", async () => {
  const result = await validateContract();
  assert.equal(result.status, "PASS_LOCAL_CURRENT_CYCLE_CANONICAL_COMPAT_HANDOFF_CONTRACT");
  assert.deepEqual(result.contract.sequence, SEQUENCE);
  assert.equal(result.contract.children.codePresence.packageId, CHILD_PACKAGES.codePresence);
  assert.equal(result.contract.children.codePresence.productionMutationAllowed, false);
  assert.equal(result.contract.children.codePresence.independentAuthorizationRequired, true);
  assert.equal(result.contract.children.canonicalCompatPhase.packageId,
    CHILD_PACKAGES.canonicalCompatPhase);
  assert.equal(result.contract.children.canonicalCompatPhase.productionMutationAllowed, true);
  assert.equal(result.contract.children.canonicalCompatPhase.independentAuthorizationRequired,
    true);
  assert.equal(result.contract.children.canonicalCompatPhase.independentLeaseRequired, true);
  assert.equal(result.contract.children.canonicalCompatPhase.independentRollbackRequired, true);

  const entry = result.contract.entryBoundary;
  assert.equal(entry.lineageSchema, "candidate-multi-cycle-lineage-evidence.v3");
  assert.equal(entry.reconciliationSchema, "candidate-multi-cycle-reconciliation-evidence.v3");
  assert.equal(entry.sourceReleaseWindowsExact, 7);
  assert.equal(entry.dualReadExactSamples, 289);
  assert.equal(entry.dualReadMinimumHours, 24);
  assert.equal(entry.dualReadMaximumDifferences, 0);
  assert.equal(entry.legacyResponseAuthority, true);
  assert.equal(entry.canonicalCompatStarted, false);

  const handoff = result.contract.handoffBoundary;
  assert.equal(handoff.codePresencePassRequiredBeforePhaseRequest, true);
  assert.equal(handoff.phaseRequestGeneratedFromCurrentRunEvidenceOnly, true);
  assert.equal(handoff.strictSequentialFailClosed, true);
  assert.equal(handoff.automaticPhaseAdvanceWithoutIndependentRequest, false);
  assert.equal(result.contract.executionBoundary.singleUpload, true);
  assert.equal(result.contract.executionBoundary.productionWipExact, 1);
  assert.equal(result.contract.executionBoundary.outerMutationAllowed, false);
  assert.equal(result.contract.resultBoundary.canonicalCompatObservationCompleted, false);
  assert.equal(result.contract.resultBoundary.canonicalCutoverExecuted, false);
  assert.equal(result.contract.resultBoundary.wpG02Completed, false);
  assert.equal(result.contract.resultBoundary.g0Completed, false);
  assert.ok(result.contract.forbidden.includes("phase_request_before_code_presence_pass"));
  assert.equal(result.contract.forbidden.includes("phase_request_before_readonly_pass"), false);
  assert.equal(REQUIRED_PRODUCTION_COMMIT,
    "47741f3222247562843932b01607a1ec3abb534e");
});

test("one transport is byte reproducible with two independently hash-bound children", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canonical-compat-handoff-bundle-"));
  try {
    const first = await buildTransportBundle({
      output: join(directory, "first.tar.gz"),
      sourceIdentity,
      approvalEligible: false,
    });
    const second = await buildTransportBundle({
      output: join(directory, "second.tar.gz"),
      sourceIdentity,
      approvalEligible: false,
    });
    assert.equal(first.status, "PASS_LOCAL_CANONICAL_COMPAT_HANDOFF_TEMPLATE");
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.output), await readFile(second.output));
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, ["web"]);
    assert.deepEqual(first.manifest.sequence, SEQUENCE);
    assert.deepEqual(Object.keys(first.manifest.children).sort(),
      ["canonicalCompatPhase", "codePresence"]);

    for (const key of ["codePresence", "canonicalCompatPhase"]) {
      const child = first.manifest.children[key];
      const repeated = second.manifest.children[key];
      assert.equal(child.packageId, CHILD_PACKAGES[key]);
      assert.equal(child.archivePath, CHILD_ARCHIVES[key]);
      assert.equal(child.sha256, repeated.sha256);
    }
    assert.notEqual(first.manifest.children.codePresence.sha256,
      first.manifest.children.canonicalCompatPhase.sha256);

    const stage = join(directory, "stage");
    await extract(first.output, stage);
    const manifest = JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8"));
    await verifyStagedTransport(stage, manifest, { requireApproval: false });

    const childManifests = {};
    for (const key of ["codePresence", "canonicalCompatPhase"]) {
      const archive = join(stage, manifest.children[key].archivePath);
      const bytes = await readFile(archive);
      assert.equal(sha256(bytes), manifest.children[key].sha256);
      const childRoot = join(directory, `child-${key}`);
      await extract(archive, childRoot);
      childManifests[key] = JSON.parse(
        await readFile(join(childRoot, "transport-manifest.json"), "utf8"));
      assert.equal(childManifests[key].packageId, CHILD_PACKAGES[key]);
    }
    assert.equal(childManifests.codePresence.productionMutationAllowed, false);
    assert.deepEqual(childManifests.codePresence.services, []);
    assert.equal(childManifests.canonicalCompatPhase.containsSecrets, false);
    assert.equal(childManifests.canonicalCompatPhase.schemaVersion,
      "wp-g0.2-canonical-compat-phase-transport.v1");
    assert.deepEqual(childManifests.canonicalCompatPhase.services, ["web", "candidate-shadow-worker"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("staged verification rejects drift in either complete child archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canonical-compat-handoff-drift-"));
  try {
    const bundle = await buildTransportBundle({
      output: join(directory, "transport.tar.gz"),
      sourceIdentity,
      approvalEligible: false,
    });
    for (const key of ["codePresence", "canonicalCompatPhase"]) {
      const stage = join(directory, `stage-${key}`);
      await extract(bundle.output, stage);
      const manifest = JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8"));
      const child = resolve(stage, manifest.children[key].archivePath);
      await appendFile(child, Buffer.from("child-drift"));
      await assert.rejects(verifyStagedTransport(stage, manifest, { requireApproval: false }),
        /transport_artifact_mismatch|transport_file_mismatch|transport_child_binding_invalid/u);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
