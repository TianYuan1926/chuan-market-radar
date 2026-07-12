import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMUM_OBSERVATION_SAMPLES,
  evaluateObservationEvidence,
  renderActivationEnvironment,
  validateActivationRelease,
  validateApprovalRequest,
  validateObservationSample,
  validatePreActivationEnvironment,
} from "./runner.mjs";

const contract = {
  activationReleaseArtifact: { files: ["src/lib/candidate-episode/feature-flags.ts"] },
  runnerArtifact: { sha256: "b".repeat(64) },
};

const request = {
  approvalDigest: `sha256:${"d".repeat(64)}`,
  approvalExpiresAt: "2026-07-12T09:00:00.000Z",
  approvalIssuedAt: "2026-07-12T07:59:00.000Z",
  approvalRef: "candidate-activation-approval",
  approvedActivationArtifactSha256: "a".repeat(64),
  approvedCommit: "1".repeat(40),
  approvedRunnerArtifactSha256: "b".repeat(64),
  automaticControlRollbackAllowed: true,
  automaticEnvironmentRollbackAllowed: true,
  automaticServiceRollbackAllowed: true,
  businessDmlAllowed: false,
  candidateDatabaseUrlMutationAllowed: false,
  candidateFeatureFlagEnablementAllowed: true,
  candidateWorkerStartAllowed: true,
  canonicalReadAllowed: false,
  canonicalWriteAllowed: false,
  codeActivationAllowed: true,
  composeProfile: "candidate-shadow-runtime",
  controlLifecycleStartAllowed: true,
  dormantDeployStatus: "PASS_DORMANT_RUNTIME_DEPLOY",
  dualReadAllowed: false,
  environmentMutationAllowed: true,
  execute: true,
  migrationAllowed: false,
  migrationId: "candidate-episode-v1",
  minimumObservationHours: 24,
  observationIntervalSeconds: 300,
  operator: "codex",
  packageId: "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE",
  productionRankingMutationAllowed: false,
  releaseId: "candidate-shadow-release-20260712",
  reviewReadAllowed: false,
  rollbackCommit: "2".repeat(40),
  runtimeIdentityStatus: "PASS_RUNTIME_IDENTITY_AND_PERMISSION",
  runnerContractSha256: "e".repeat(64),
  schemaDdlAllowed: false,
  services: ["web", "candidate-shadow-worker"],
  shadowWriteAllowed: true,
  workerExpectedAllowed: true,
};

function sample(index, { completed = index, overrides = {} } = {}) {
  return {
    schemaVersion: "candidate-shadow-observation-sample.v1",
    sampledAt: new Date(Date.parse("2026-07-12T00:00:00.000Z") + index * 300_000).toISOString(),
    commit: request.approvedCommit,
    releaseId: request.releaseId,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      databaseStatus: "ready",
      redisStatus: "healthy",
      workers: [
        "scanner-worker", "websocket-light-worker", "coinglass-worker", "signal-worker",
        "dynamic-scan-scheduler", "macro-worker", "candidate-shadow-worker",
      ].map((key) => ({ key, status: "healthy", ageSec: 5 })),
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: 1,
        expectedReleaseId: request.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        authorityEpoch: 1,
        blockers: [],
        warnings: [],
        metrics: {
          outboxRetryWaitTotal: 0,
          unresolvedQuarantineTotal: 0,
          outboxQuarantinedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: completed,
        },
      },
    },
    database: { lockWaiters: 0, longTransactions: 0, identityErrors: 0 },
    ...overrides,
  };
}

test("approval locks activation scope while denying migration, canonical paths and ranking mutation", () => {
  const now = new Date("2026-07-12T08:00:00.000Z");
  assert.equal(validateApprovalRequest(request, contract, { now }), request);
  for (const key of [
    "businessDmlAllowed", "candidateDatabaseUrlMutationAllowed", "canonicalReadAllowed",
    "canonicalWriteAllowed", "dualReadAllowed", "migrationAllowed",
    "productionRankingMutationAllowed", "reviewReadAllowed", "schemaDdlAllowed",
  ]) {
    assert.throws(
      () => validateApprovalRequest({ ...request, [key]: true }, contract, { now }),
      new RegExp(`${key}_must_be_false`),
    );
  }
  assert.throws(
    () => validateApprovalRequest({ ...request, minimumObservationHours: 23 }, contract, { now }),
    /observation_window_mismatch/,
  );
});

test("expired approval cannot activate but remains valid for pre-approved safety rollback", () => {
  const late = new Date("2026-07-13T08:00:00.000Z");
  assert.throws(() => validateApprovalRequest(request, contract, { now: late }), /approval_window_expired/);
  assert.equal(validateApprovalRequest(request, contract, {
    allowExpiredForRollback: true,
    now: late,
  }), request);
});

test("activation environment changes only shadow write, release and worker expectation", () => {
  const source = [
    "CANDIDATE_SOURCE_DATABASE_URL=candidate-source-placeholder",
    "CANDIDATE_CONSUMER_DATABASE_URL=candidate-consumer-placeholder",
    "CANDIDATE_MONITOR_DATABASE_URL=candidate-monitor-placeholder",
    "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
    "CANDIDATE_EPISODE_SHADOW_WRITE=false",
    "CANDIDATE_EPISODE_DUAL_READ=false",
    "CANDIDATE_EPISODE_CANONICAL_READ=false",
    "CANDIDATE_EPISODE_REVIEW_READ=false",
    "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
    "CANDIDATE_SHADOW_WORKER_EXPECTED=false",
    "UNCHANGED=value",
    "",
  ].join("\n");
  assert.deepEqual(validatePreActivationEnvironment(source), {
    candidateDatabaseUrlsConfigured: 3,
    candidateFeatureFlagsEnabled: 0,
    candidateWorkerExpected: false,
  });
  const rendered = renderActivationEnvironment(source, request.releaseId);
  assert.match(rendered, /CANDIDATE_EPISODE_SHADOW_WRITE="true"/);
  assert.match(rendered, /CANDIDATE_RUNTIME_RELEASE_ID="candidate-shadow-release-20260712"/);
  assert.match(rendered, /CANDIDATE_SHADOW_WORKER_EXPECTED="true"/);
  assert.match(rendered, /CANDIDATE_EPISODE_CANONICAL_WRITE="false"/);
  assert.match(rendered, /CANDIDATE_SOURCE_DATABASE_URL=candidate-source-placeholder/);
  assert.match(rendered, /UNCHANGED=value/);
  assert.equal((rendered.match(/CANDIDATE_RUNTIME_RELEASE_ID=/g) ?? []).length, 1);
});

test("current preparation branch cannot impersonate a future activation release", async () => {
  await assert.rejects(
    validateActivationRelease(process.cwd(), {
      ...request,
      approvedActivationArtifactSha256: "0".repeat(64),
    }, contract),
    /activation_artifact_checksum_mismatch/,
  );
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const content = await readFile("src/lib/candidate-episode/feature-flags.ts");
  const checksums = {
    "src/lib/candidate-episode/feature-flags.ts": createHash("sha256").update(content).digest("hex"),
  };
  await assert.rejects(
    validateActivationRelease(process.cwd(), {
      ...request,
      approvedActivationArtifactSha256: createHash("sha256").update(JSON.stringify(checksums)).digest("hex"),
    }, contract),
    /release_not_activation_authorized/,
  );
});

test("one sample fails closed on worker, runtime, monitor or database degradation", () => {
  assert.equal(validateObservationSample(sample(1), request).candidate.mode, "active");
  const workerDown = sample(1);
  workerDown.health.workers.at(-1).status = "down";
  assert.throws(() => validateObservationSample(workerDown, request), /sample_worker_not_healthy/);
  const warning = sample(1);
  warning.candidate.monitor.warnings = ["retry_wait_present"];
  assert.throws(() => validateObservationSample(warning, request), /sample_monitor_warning/);
  assert.throws(
    () => validateObservationSample(sample(1, { overrides: { database: { lockWaiters: 1, longTransactions: 0, identityErrors: 0 } } }), request),
    /sample_database_lock_waiters/,
  );
});

test("final PASS requires 24 real hours, 5 minute cadence, clean samples and completed writes", () => {
  const samples = Array.from({ length: MINIMUM_OBSERVATION_SAMPLES }, (_, index) => sample(index));
  const result = evaluateObservationEvidence(samples, request);
  assert.deepEqual(result, {
    status: "PASS_ACTIVATE_AND_OBSERVE",
    automaticPhaseAdvance: false,
    comparedWritesGateEvaluated: false,
    completedWrites: 288,
    coverageHours: 24,
    maximumGapSeconds: 300,
    sampleCount: 289,
  });
  assert.throws(() => evaluateObservationEvidence(samples.slice(1), request), /observation_samples_insufficient/);
  const gap = [
    ...Array.from({ length: 150 }, (_, index) => sample(index)),
    ...Array.from({ length: 139 }, (_, index) => sample(index + 152)),
  ];
  assert.throws(() => evaluateObservationEvidence(gap, request), /observation_sample_gap_exceeded/);
  const regressed = samples.map((item) => structuredClone(item));
  regressed[200].candidate.monitor.metrics.outboxCompletedTotal = 1;
  assert.throws(() => evaluateObservationEvidence(regressed, request), /observation_completed_regressed/);
});
