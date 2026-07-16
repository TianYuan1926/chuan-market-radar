import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateObservationEvidence } from "../candidate-activation/runner.mjs";
import { evaluateCycleObservation } from "../candidate-cycle-continuation/observation-runner.mjs";
import {
  CAPTURE_SPEC_SCHEMA,
  loadLineageCaptureInputs,
  PACKAGE_ID,
  validateCaptureSpecification,
} from "./production-runner.mjs";
import { sha256 } from "./runner.mjs";

const activationExpected = {
  authorityEpoch: 3,
  commit: "a".repeat(40),
  migrationId: "candidate-episode-v1",
  releaseId: "candidate-shadow-capture-packet-cycle-1",
};
const freshExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-2",
  releaseId: "candidate-shadow-capture-packet-cycle-2",
};

function activationSample(index) {
  return {
    schemaVersion: "candidate-shadow-observation-sample.v1",
    sampledAt: new Date(Date.parse("2026-07-11T00:00:00.000Z") + index * 300_000).toISOString(),
    commit: activationExpected.commit,
    releaseId: activationExpected.releaseId,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      databaseStatus: "ready",
      redisStatus: "healthy",
      workers: [
        "scanner-worker", "websocket-light-worker", "coinglass-worker", "signal-worker",
        "dynamic-scan-scheduler", "macro-worker", "candidate-shadow-worker",
      ].map((key) => ({ ageSec: 5, key, status: "healthy" })),
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: activationExpected.authorityEpoch,
        expectedReleaseId: activationExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        authorityEpoch: activationExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxRetryWaitTotal: 0,
          unresolvedQuarantineTotal: 0,
          outboxQuarantinedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: index + 1,
        },
      },
    },
    database: { identityErrors: 0, lockWaiters: 0, longTransactions: 0 },
  };
}

function cycleSamples(expected, start, values, deadlineAt) {
  return values.map((completedWrites, index) => ({
    schemaVersion: "candidate-validation-cycle-observation-sample.v1",
    sampledAt: new Date(Date.parse(start) + index * 300_000).toISOString(),
    commit: expected.commit,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    phase: "shadow_capture",
    epoch: expected.authorityEpoch,
    deadlineAt,
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
  }));
}

async function writeEvidence(root, label, expected, samples, activation = false) {
  const final = activation
    ? evaluateObservationEvidence(samples, {
      approvedCommit: expected.commit,
      authorityEpoch: expected.authorityEpoch,
      migrationId: expected.migrationId,
      releaseId: expected.releaseId,
    })
    : evaluateCycleObservation(samples, expected);
  const closeout = {
    schemaVersion: activation
      ? "candidate-observation-closeout.v1"
      : "candidate-cycle-observation-closeout.v1",
    outcome: activation
      ? "PASS_ACTIVATE_AND_OBSERVE"
      : "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE",
    closedAt: "2026-07-14T02:00:00.000Z",
    secretsPrinted: false,
  };
  const paths = {
    final: join(root, `${label}-final.json`),
    samples: join(root, `${label}-samples.jsonl`),
    closeout: join(root, `${label}-closeout.json`),
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
    authorityEpoch: expected.authorityEpoch,
    closeoutPath: paths.closeout,
    closeoutSha256: sha256(bytes.closeout),
    commit: expected.commit,
    finalPath: paths.final,
    finalSha256: sha256(bytes.final),
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    samplesPath: paths.samples,
    samplesSha256: sha256(bytes.samples),
  };
}

async function fixture(root) {
  const activationSamples = Array.from({ length: 289 }, (_, index) => activationSample(index));
  const accumulationSamples = cycleSamples(
    activationExpected,
    "2026-07-13T00:00:00.000Z",
    [9_990, 9_990, 9_995, 9_995, 10_005, 10_005, 10_005],
    "2026-07-14T00:00:00.000Z",
  );
  const freshSamples = cycleSamples(
    freshExpected,
    "2026-07-13T01:05:00.000Z",
    [10_005, 10_005, 10_010, 10_010, 10_020, 10_020, 10_020],
    "2026-07-16T01:00:00.000Z",
  );
  return {
    schemaVersion: CAPTURE_SPEC_SCHEMA,
    packageId: PACKAGE_ID,
    productionMutationAllowed: false,
    outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v1",
    activation: await writeEvidence(root, "activation", activationExpected, activationSamples, true),
    accumulation: await writeEvidence(
      root, "accumulation", activationExpected, accumulationSamples,
    ),
    fresh: await writeEvidence(root, "fresh", freshExpected, freshSamples),
  };
}

test("production capture inputs are private, hash-bound, and rebuilt from all raw samples", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const specification = await fixture(root);
    assert.equal(validateCaptureSpecification(specification), specification);
    const inputs = await loadLineageCaptureInputs(specification);
    assert.equal(inputs.activation.samples.length, 289);
    assert.equal(inputs.accumulation.samples.length, 7);
    assert.equal(inputs.fresh.samples.length, 7);
    assert.equal(inputs.accumulation.final.completedWrites, 10_005);
    assert.equal(inputs.fresh.final.completedWrites, 10_020);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampered samples, open permissions, and a non-adjacent fresh cycle fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const tampered = await fixture(root);
    await writeFile(tampered.fresh.samplesPath, "{}\n", { mode: 0o600 });
    await assert.rejects(loadLineageCaptureInputs(tampered), /fresh_samples_hash_mismatch/u);

    const open = await fixture(root);
    await chmod(open.activation.finalPath, 0o644);
    await assert.rejects(loadLineageCaptureInputs(open), /activation_final_permissions_too_open/u);

    const nonAdjacent = await fixture(root);
    nonAdjacent.fresh.migrationId = "candidate-episode-v1-cycle-3";
    assert.throws(() => validateCaptureSpecification(nonAdjacent),
      /fresh_capture_cycle_not_adjacent/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed closeout cannot be relabeled as production lineage evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-production-runner-"));
  try {
    const specification = await fixture(root);
    const closeout = JSON.parse(await readFile(specification.accumulation.closeoutPath, "utf8"));
    closeout.outcome = "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE";
    const bytes = Buffer.from(`${JSON.stringify(closeout)}\n`);
    await writeFile(specification.accumulation.closeoutPath, bytes, { mode: 0o600 });
    specification.accumulation.closeoutSha256 = sha256(bytes);
    await assert.rejects(loadLineageCaptureInputs(specification),
      /accumulation_closeout_not_pass/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
