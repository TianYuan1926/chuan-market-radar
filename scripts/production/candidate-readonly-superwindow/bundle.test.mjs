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
  policySha256: hash("7"),
};

test("contract locks the superwindow to three independent read-only children", async () => {
  const contract = await validateContract();
  assert.equal(contract.status, "PASS_LOCAL_READ_ONLY_SUPERWINDOW_CONTRACT");
  assert.equal(contract.productionMutationAllowed, false);
  assert.deepEqual(contract.services, []);
  assert.equal(contract.formalBacktestAllowed, false);
});

test("single transport is byte reproducible and each child archive remains hash-bound", async () => {
  const directory = await mkdtemp(join(tmpdir(), "readonly-superwindow-bundle-"));
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
    assert.equal(first.status, "PASS_LOCAL_CYCLE_5_READ_ONLY_SUPERWINDOW_TEMPLATE");
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.manifest.containsSecrets, false);
    assert.equal(first.manifest.productionMutationAllowed, false);
    assert.deepEqual(first.manifest.services, []);
    assert.equal(new Set(Object.values(first.manifest.children).map((child) => child.sha256)).size, 3);

    const stage = join(directory, "stage");
    await mkdir(stage, { recursive: true });
    await execFileAsync("tar", ["-xzf", first.output, "-C", stage]);
    const manifest = JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8"));
    await verifyStagedTransport(stage, manifest, { requireApproval: false });

    const childPath = join(stage, manifest.children.lineage.archivePath);
    await writeFile(childPath, Buffer.concat([await readFile(childPath), Buffer.from("drift")]));
    await assert.rejects(verifyStagedTransport(stage, manifest, { requireApproval: false }),
      /transport_artifact_mismatch|transport_file_mismatch|transport_child_binding_invalid/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("embedded code-presence request generator executes against its exact child packet", async () => {
  const directory = await mkdtemp(join(tmpdir(), "readonly-superwindow-request-"));
  try {
    const transport = await buildTransportBundle({
      output: join(directory, "superwindow.tar.gz"),
      sourceIdentity,
      approvalEligible: false,
    });
    const stage = join(directory, "stage");
    const child = join(directory, "child");
    await Promise.all([mkdir(stage), mkdir(child)]);
    await execFileAsync("tar", ["-xzf", transport.output, "-C", stage]);
    await execFileAsync("tar", [
      "-xzf", join(stage, transport.manifest.children.codePresence.archivePath), "-C", child,
    ]);
    const runtimePath = join(directory, "runtime.json");
    const outputPath = join(directory, "request.json");
    await writeFile(runtimePath, JSON.stringify({
      buildRecordSha256: hash("a"),
      buildRecordWebImageId: `sha256:${hash("b")}`,
      currentWebContainerId: "c".repeat(12),
      currentWebImageId: `sha256:${hash("b")}`,
      healthLevel: "ready",
      scanFreshness: "fresh",
    }));
    await execFileAsync(process.execPath, [
      "scripts/production/candidate-readonly-superwindow/request-generator.mjs",
      "code-presence",
      "--packet-root", child,
      "--manifest", join(child, "transport-manifest.json"),
      "--runtime", runtimePath,
      "--bundle", transport.manifest.children.codePresence.sha256,
      "--output", outputPath,
      "--now", "2026-07-21T00:00:00.000Z",
    ]);
    const request = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(request.services.length, 0);
    assert.equal(request.transportBundleSha256,
      transport.manifest.children.codePresence.sha256);
    assert.equal(request.currentWebImageId, `sha256:${hash("b")}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
