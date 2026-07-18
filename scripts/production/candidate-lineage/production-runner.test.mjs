import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateCycleObservation } from
  "../candidate-cycle-continuation/observation-runner.mjs";
import {
  CAPTURE_SPEC_SCHEMA,
  loadLineageCaptureInputs,
  PACKAGE_ID,
  validateCaptureSpecification,
} from "./production-runner.mjs";
import { sha256 } from "./runner.mjs";

const unifiedExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-5",
  releaseId: "candidate-shadow-capture-packet-cycle-5",
};

function unifiedSample(index) {
  const completedWrites = 2_957 + Math.floor(index * (10_020 - 2_957) / 288);
  return {
    schemaVersion: "candidate-validation-cycle-observation-sample.v2",
    sampledAt: new Date(Date.parse("2026-07-15T00:00:00.000Z") + index * 300_000)
      .toISOString(),
    commit: unifiedExpected.commit,
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    phase: "shadow_capture",
    epoch: unifiedExpected.authorityEpoch,
    deadlineAt: "2026-07-18T00:00:00.000Z",
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: unifiedExpected.authorityEpoch,
        expectedReleaseId: unifiedExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        migrationId: unifiedExpected.migrationId,
        authorityEpoch: unifiedExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxPendingTotal: 0,
          outboxClaimedTotal: 0,
          outboxRetryWaitTotal: 0,
          outboxQuarantinedTotal: 0,
          unresolvedQuarantineTotal: 0,
          unresolvedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: completedWrites,
        },
      },
    },
    database: { lockWaiters: 0, longTransactions: 0 },
  };
}

async function writeEvidence(root) {
  const samples = Array.from({ length: 289 }, (_, index) => unifiedSample(index));
  const final = evaluateCycleObservation(samples, unifiedExpected);
  const closeout = {
    schemaVersion: "candidate-cycle-observation-closeout.v1",
    outcome: "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE",
    closedAt: "2026-07-16T00:01:00.000Z",
    secretsPrinted: false,
  };
  const paths = {
    final: join(root, "cycle-observation-final.json"),
    samples: join(root, "cycle-observation-samples.jsonl"),
    closeout: join(root, "cycle-observation-closeout.json"),
  };
  const bytes = {
    final: Buffer.from(`${JSON.stringify(final)}\n`),
    samples: Buffer.from(`${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`),
    closeout: Buffer.from(`${JSON.stringify(closeout)}\n`),
  };
  for (const key of Object.keys(paths)) {
    await writeFile(paths[key], bytes[key], { mode: 0o600 });
  }
  return {
    authorityEpoch: unifiedExpected.authorityEpoch,
    closeoutPath: paths.closeout,
    closeoutSha256: sha256(bytes.closeout),
    commit: unifiedExpected.commit,
    finalPath: paths.final,
    finalSha256: sha256(bytes.final),
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    samplesPath: paths.samples,
    samplesSha256: sha256(bytes.samples),
  };
}

async function fixture(root) {
  return {
    schemaVersion: CAPTURE_SPEC_SCHEMA,
    packageId: PACKAGE_ID,
    productionMutationAllowed: false,
    outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
    unified: await writeEvidence(root),
  };
}

test("production capture inputs are private, hash-bound, and rebuilt from raw v2 samples", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const specification = await fixture(root);
    assert.equal(validateCaptureSpecification(specification), specification);
    const inputs = await loadLineageCaptureInputs(specification);
    assert.equal(inputs.unified.samples.length, 289);
    assert.equal(inputs.unified.final.completedWrites, 10_020);
    assert.equal(inputs.unified.final.activationCoverageSeconds, 86_400);
    assert.equal(inputs.unified.final.freshActivationReady, true);
    assert.equal(inputs.unified.final.accumulationReady, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampered samples, open permissions, and single-cycle evidence fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const tampered = await fixture(root);
    await writeFile(tampered.unified.samplesPath, "{}\n", { mode: 0o600 });
    await assert.rejects(loadLineageCaptureInputs(tampered), /unified_samples_hash_mismatch/u);

    const open = await fixture(root);
    await chmod(open.unified.finalPath, 0o644);
    await assert.rejects(loadLineageCaptureInputs(open),
      /unified_final_permissions_too_open/u);

    await chmod(open.unified.finalPath, 0o600);
    const wrongCycle = await fixture(root);
    wrongCycle.unified.migrationId = "candidate-episode-v1";
    assert.throws(() => validateCaptureSpecification(wrongCycle),
      /unified_capture_not_multi_cycle/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed current-cycle closeout cannot be relabeled as lineage evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const specification = await fixture(root);
    const closeout = JSON.parse(await readFile(specification.unified.closeoutPath, "utf8"));
    closeout.outcome = "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE";
    const bytes = Buffer.from(`${JSON.stringify(closeout)}\n`);
    await writeFile(specification.unified.closeoutPath, bytes, { mode: 0o600 });
    specification.unified.closeoutSha256 = sha256(bytes);
    await assert.rejects(loadLineageCaptureInputs(specification),
      /unified_closeout_not_pass/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
