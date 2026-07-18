import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  validateContract,
  verifyStagedTransport,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const sourceIdentity = {
  sourceCommit: commit("1"),
  sourceTree: commit("2"),
  sourceParentCommit: commit("3"),
  sourceDiffSha256: hash("4"),
  sourcePathSetSha256: hash("5"),
  gateEvidenceSha256: hash("6"),
};

test("contract preserves independent R0 and R2 child boundaries", async () => {
  const result = await validateContract();
  assert.equal(result.status, "PASS_LOCAL_SHADOW_VERIFY_HANDOFF_CONTRACT");
  assert.equal(result.contract.executionBoundary.singleUpload, true);
  assert.equal(result.contract.executionBoundary.productionWipExact, 1);
  assert.equal(result.contract.handoffBoundary.automaticPhaseAdvanceWithoutIndependentRequest,
    false);
  assert.equal(result.contract.resultBoundary.dualReadObservationCompleted, false);
  assert.equal(result.contract.resultBoundary.g0Completed, false);
});

test("one transport is byte reproducible and both complete children are hash-bound", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shadow-verify-handoff-bundle-"));
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
    assert.equal(first.status, "PASS_LOCAL_SHADOW_VERIFY_HANDOFF_TEMPLATE");
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, ["web"]);
    assert.deepEqual(Object.keys(first.manifest.children).sort(),
      ["readOnlySuperwindow", "shadowVerifyPhase"]);
    assert.equal(new Set(Object.values(first.manifest.children)
      .map((child) => child.sha256)).size, 2);

    const stage = join(directory, "stage");
    await mkdir(stage, { recursive: true });
    await execFileAsync("tar", ["-xzf", first.output, "-C", stage]);
    const manifest = JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8"));
    await verifyStagedTransport(stage, manifest, { requireApproval: false });

    const phase = join(stage, manifest.children.shadowVerifyPhase.archivePath);
    await writeFile(phase, Buffer.concat([await readFile(phase), Buffer.from("drift")]));
    await assert.rejects(verifyStagedTransport(stage, manifest, { requireApproval: false }),
      /transport_artifact_mismatch|transport_file_mismatch|transport_child_binding_invalid/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
