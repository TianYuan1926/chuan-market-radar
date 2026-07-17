import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  CONTRACT_PATH,
  runnerArtifactSha256,
  validateLegacyPendingDrainContract,
} from "./candidate-legacy-pending-drain.mjs";

const root = resolve(import.meta.dirname, "../..");

test("validates the exact pending-only drain governance boundary", async () => {
  const result = await validateLegacyPendingDrainContract(root);
  assert.deepEqual(result.violations, []);
  assert.equal(result.status, "pass");
  assert.equal(result.productionExecuted, false);
  assert.equal(result.g0Completed, false);
});

test("artifact checksum binds every executable governance file", async () => {
  const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
  assert.equal(await runnerArtifactSha256(root, contract.runnerArtifact.files),
    contract.runnerArtifact.sha256);
});

test("rejects threshold relaxation and false production completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-pending-drain-contract-"));
  try {
    const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
    contract.productionExecuted = true;
    contract.entryBoundary.pendingMinimum = 0;
    contract.drainLifecycle.quarantineAllowed = true;
    contract.exitBoundary.nextCycleAutoAuthorized = true;
    contract.truthBoundary.g0Complete = true;
    const target = resolve(directory, CONTRACT_PATH);
    await import("node:fs/promises").then(({ mkdir }) => mkdir(dirname(target), { recursive: true }));
    await writeFile(target, `${JSON.stringify(contract, null, 2)}\n`);
    for (const file of contract.runnerArtifact.files) {
      const destination = resolve(directory, file);
      await import("node:fs/promises").then(({ mkdir }) => mkdir(dirname(destination), { recursive: true }));
      await writeFile(destination, await readFile(resolve(root, file)));
    }
    contract.runnerArtifact.sha256 = await runnerArtifactSha256(directory,
      contract.runnerArtifact.files);
    await writeFile(target, `${JSON.stringify(contract, null, 2)}\n`);
    const result = await validateLegacyPendingDrainContract(directory);
    assert.equal(result.status, "fail");
    assert.ok(result.violations.includes("production_boundary"));
    assert.ok(result.violations.includes("entry_pending_only_boundary"));
    assert.ok(result.violations.includes("drain_failure_boundary"));
    assert.ok(result.violations.includes("exit_infrastructure_boundary"));
    assert.ok(result.violations.includes("truth_boundary"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
