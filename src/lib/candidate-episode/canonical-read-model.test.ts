import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED,
  CandidateCanonicalReadModel,
  compareCandidateCanonicalReferenceReads,
  evaluateCandidateReadRoute,
  evaluateCandidateReadParityEvidence,
  evaluateCurrentCandidateReadRoute,
  executeCandidateReadRoute,
  type CandidateCanonicalReadReady,
} from "./canonical-read-model";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";

const episodeRow = {
  schema_version: "candidate-episode.v1",
  scope: "production_radar",
  episode_id: "018f47d6-2c40-7e30-8a20-000000000001",
  canonical_instrument_id: "BINANCE:BTCUSDT:PERP",
  venue_context: { venue: "BINANCE" },
  first_seen_at: "2026-07-12T00:00:00.000Z",
  last_seen_at: "2026-07-12T00:05:00.000Z",
  observation_price: null,
  observation_price_fact_id: null,
  discovery_reasons: ["light_scan_candidate"],
  priority_tier: "A",
  lifecycle: "discovered",
  maturity: "light_candidate",
  direction_state: "unknown",
  expires_at: null,
  closed_at: null,
  closed_reason: null,
  parent_episode_id: null,
  release_id: "candidate-shadow-release-test",
  source_scan_cycle_id: "scan-1",
  row_version: "1",
};

const reviewRow = {
  database_now: "2026-07-12T01:00:00.000Z",
  active_episodes: "1",
  claimed_checkpoints: "0",
  closed_episodes: "0",
  completed_checkpoints: "2",
  data_unavailable_outcomes: "1",
  due_checkpoints: "3",
  evidence_grade_outcomes: "1",
  missed_outcomes: "0",
  metric_sample_count: "1",
  pending_checkpoints: "1",
  pending_with_error_checkpoints: "0",
  recorded_outcomes: "1",
  retry_waiting_checkpoints: "0",
  scheduled_checkpoints: "3",
  terminal_outcomes: "2",
  total_episodes: "1",
  average_mae: "-0.03",
  average_mfe: "0.12",
  excluded_reasons: { data_unavailable: 1 },
};

const readPolicy = {
  scope: "production_radar",
  asOf: "2026-07-12T01:00:00.000Z",
  releaseId: "candidate-shadow-release-test",
  checkpointKind: "1h",
  evidenceGradeVersion: "eg.v1",
  observationCohort: {
    from: "2026-07-11T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
  dueCohort: {
    from: "2026-07-11T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
} as const;

function mockReadAdapter({ fail = false, rows = [episodeRow], review = reviewRow } = {}) {
  let call = 0;
  return {
    async withTransaction(_options: unknown, callback: (tx: TransactionContext) => Promise<unknown>) {
      if (fail) throw new Error("database unavailable");
      return callback({
        async query<T>() {
          call += 1;
          return { rows: (call === 1 ? rows : [review]) as T[] };
        },
        async withSavepoint<T>(work: (tx: TransactionContext) => Promise<T>) {
          return work(this);
        },
      });
    },
  } as PostgresTransactionAdapter;
}

async function readyRead() {
  const result = await new CandidateCanonicalReadModel(mockReadAdapter()).read({ policy: readPolicy });
  assert.equal(result.status, "ready");
  return result as CandidateCanonicalReadReady;
}

test("canonical read preserves unknown and null facts and uses authoritative denominators", async () => {
  const result = await readyRead();
  assert.equal(result.episodes[0]?.directionState, "unknown");
  assert.equal(result.episodes[0]?.observationPrice, null);
  assert.equal(result.episodes[0]?.observationPriceFactId, null);
  assert.equal(result.review.counts.totalEpisodes, 1);
  assert.equal(result.review.counts.terminalOutcomes, 2);
  assert.equal(result.review.counts.metricSampleCount, 1);
  assert.equal(result.review.metricAverages.mfe, 0.12);
  assert.equal(result.review.metricAverages.mae, -0.03);
  assert.equal(result.review.metricAdmission.percentage, 50);
  assert.deepEqual(result.review.metricAdmission.excludedReasons, { data_unavailable: 1 });
  assert.ok(Math.abs((result.review.rates.outcomeCompletion.percentage ?? 0) - 100 * 2 / 3) < 1e-12);
  assert.ok(Math.abs((result.review.rates.evidenceCoverage.percentage ?? 0) - 100 / 3) < 1e-12);
  assert.deepEqual(result.review.rates.outcomeCompletion.excludedReasons, { pending: 1 });
  assert.equal(result.review.invariants.completedCheckpointsEqualTerminalOutcomes, true);
  assert.deepEqual(result.policy, readPolicy);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.canCreateTradePlan, false);
  assert.equal(result.canMutateLiveRanking, false);
  assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
});

test("database failure and invalid input are unavailable, never fake empty ready data", async () => {
  const failed = await new CandidateCanonicalReadModel(mockReadAdapter({ fail: true })).read({ policy: readPolicy });
  assert.deepEqual(failed, {
    schemaVersion: "candidate-canonical-read.v1",
    status: "unavailable",
    authority: "candidate_authority",
    allowedUse: "candidate_lifecycle_and_review_only",
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    policy: null,
    reason: "candidate_database_read_failed",
    databaseNow: null,
    episodes: null,
    page: null,
    review: null,
    contentHash: null,
  });
  const invalid = await new CandidateCanonicalReadModel(mockReadAdapter()).read({ policy: readPolicy, limit: 0 });
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.reason, "candidate_read_input_invalid");
  const invalidPolicy = await new CandidateCanonicalReadModel(mockReadAdapter()).read({
    policy: {
      ...readPolicy,
      observationCohort: { ...readPolicy.observationCohort, toExclusive: readPolicy.asOf },
      asOf: "2026-07-11T23:00:00.000Z",
    },
  });
  assert.equal(invalidPolicy.status, "unavailable");
  assert.equal(invalidPolicy.reason, "candidate_read_input_invalid");
});

test("canonical read forwards the route abort signal into the database transaction", async () => {
  const controller = new AbortController();
  let observedSignal: AbortSignal | undefined;
  const adapter = {
    async withTransaction<T>(
      options: { signal?: AbortSignal },
      callback: (tx: TransactionContext) => Promise<T>,
    ) {
      observedSignal = options.signal;
      return callback({
        async query<Result>() {
          return { rows: [] as Result[] };
        },
        async withSavepoint<Result>(work: (tx: TransactionContext) => Promise<Result>) {
          return work(this);
        },
      });
    },
  } as PostgresTransactionAdapter;
  await new CandidateCanonicalReadModel(adapter).read({
    policy: readPolicy,
    signal: controller.signal,
  });
  assert.equal(observedSignal, controller.signal);
});

test("bounded pagination emits a stable cursor without dropping null fields", async () => {
  const second = {
    ...episodeRow,
    episode_id: "018f47d6-2c40-7e30-8a20-000000000002",
    canonical_instrument_id: "BINANCE:ETHUSDT:PERP",
    first_seen_at: "2026-07-11T23:00:00.000Z",
  };
  const result = await new CandidateCanonicalReadModel(mockReadAdapter({ rows: [episodeRow, second] })).read({
    policy: readPolicy,
    limit: 1,
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.page.hasMore, true);
  assert.deepEqual(result.page.nextCursor, {
    episodeId: episodeRow.episode_id,
    firstSeenAt: episodeRow.first_seen_at,
  });
});

test("review invariant drift and stale as-of are explicit partial states", async () => {
  const inconsistent = await new CandidateCanonicalReadModel(mockReadAdapter({
    review: { ...reviewRow, completed_checkpoints: "3", metric_sample_count: "0" },
  })).read({ policy: readPolicy });
  assert.equal(inconsistent.status, "partial");
  if (inconsistent.status !== "partial") return;
  assert.ok(inconsistent.blockers.includes(
    "candidate_review_invariant_failed:completedCheckpointsEqualTerminalOutcomes",
  ));
  assert.ok(inconsistent.blockers.includes(
    "candidate_review_invariant_failed:metricSamplesEqualEvidenceGradeOutcomes",
  ));
  assert.equal(inconsistent.canCreateTradePlan, false);

  const stale = await new CandidateCanonicalReadModel(mockReadAdapter({
    review: { ...reviewRow, database_now: "2026-07-12T02:00:01.000Z" },
  })).read({ policy: readPolicy });
  assert.equal(stale.status, "partial");
  if (stale.status !== "partial") return;
  assert.ok(stale.blockers.includes("candidate_read_as_of_stale_for_current_snapshot"));
});

test("database numeric averages are normalized to the evidence metric precision", async () => {
  const result = await new CandidateCanonicalReadModel(mockReadAdapter({
    review: {
      ...reviewRow,
      average_mfe: "0.49999999500000000000",
      average_mae: "-0.15000000490000000000",
    },
  })).read({ policy: readPolicy });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.review.metricAverages.mfe, 0.5);
  assert.equal(result.review.metricAverages.mae, -0.15);
});

test("canonical parity treats null to zero and unavailable as explicit differences", async () => {
  const base = await readyRead();
  assert.equal(compareCandidateCanonicalReferenceReads(base, structuredClone(base)).status, "pass");
  const zero = {
    ...base,
    episodes: base.episodes.map((episode, index) => (
      index === 0 ? { ...episode, observationPrice: "0" } : episode
    )),
  };
  const drift = compareCandidateCanonicalReferenceReads(base, zero);
  assert.equal(drift.status, "fail");
  assert.ok(drift.differences.includes("episodes[0].observationPrice"));
  const unavailable = await new CandidateCanonicalReadModel(mockReadAdapter({ fail: true })).read({ policy: readPolicy });
  assert.equal(compareCandidateCanonicalReferenceReads(base, unavailable).status, "unavailable");
});

const evidenceStatus = "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const;

test("current production code lock defeats every read flag", () => {
  assert.equal(CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED, false);
  assert.deepEqual(evaluateCurrentCandidateReadRoute({
    phase: "canonical",
    dualReadRequested: false,
    canonicalReadRequested: true,
    reviewReadRequested: true,
    reconciliationEvidenceStatus: evidenceStatus,
    dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
    canonicalCompatEvidenceStatus: "PASS_CANONICAL_COMPAT_OBSERVATION",
  }), {
    mode: "legacy_only",
    blockers: ["canonical_read_not_authorized_in_code"],
  });
});

test("route state machine separates shadow verify, canonical compat and canonical authority", () => {
  const base = {
    codeCanonicalReadAllowed: true,
    reconciliationEvidenceStatus: evidenceStatus,
    dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
    canonicalCompatEvidenceStatus: "PASS_CANONICAL_COMPAT_OBSERVATION",
  } as const;
  assert.equal(evaluateCandidateReadRoute({
    ...base,
    phase: "shadow_verify",
    dualReadRequested: true,
    canonicalReadRequested: false,
    reviewReadRequested: false,
  }).mode, "dual_read_legacy_authority");
  assert.equal(evaluateCandidateReadRoute({
    ...base,
    phase: "canonical_compat",
    dualReadRequested: true,
    canonicalReadRequested: true,
    reviewReadRequested: true,
  }).mode, "canonical_compat");
  assert.equal(evaluateCandidateReadRoute({
    ...base,
    phase: "canonical",
    dualReadRequested: false,
    canonicalReadRequested: true,
    reviewReadRequested: true,
  }).mode, "canonical_only");
  assert.equal(evaluateCandidateReadRoute({
    ...base,
    phase: "canonical",
    dualReadRequested: true,
    canonicalReadRequested: true,
    reviewReadRequested: true,
  }).mode, "legacy_only");
  assert.deepEqual(evaluateCandidateReadRoute({
    ...base,
    phase: "canonical_compat",
    dualReadEvidenceStatus: "missing",
    dualReadRequested: true,
    canonicalReadRequested: true,
    reviewReadRequested: true,
  }), {
    mode: "legacy_only",
    blockers: ["dual_read_observation_evidence_missing"],
  });
  assert.deepEqual(evaluateCandidateReadRoute({
    ...base,
    phase: "canonical",
    canonicalCompatEvidenceStatus: "missing",
    dualReadRequested: false,
    canonicalReadRequested: true,
    reviewReadRequested: true,
  }), {
    mode: "legacy_only",
    blockers: ["canonical_compat_observation_evidence_missing"],
  });
});

test("shadow verify returns legacy; canonical compat falls back visibly on any parity drift", async () => {
  const legacy = await readyRead();
  const candidate = structuredClone(legacy);
  const driftedCandidate = {
    ...legacy,
    review: {
      ...legacy.review,
      counts: { ...legacy.review.counts, totalEpisodes: 2 },
    },
  };
  const shared = {
    codeCanonicalReadAllowed: true,
    reconciliationEvidenceStatus: evidenceStatus,
    dualReadEvidenceStatus: "missing",
    canonicalCompatEvidenceStatus: "missing",
    legacyRead: async () => legacy,
    referencePairRead: async () => ({
      sameDatabaseSnapshot: true as const,
      reference: legacy,
      candidate,
    }),
    candidateRead: async () => candidate,
  } as const;
  const shadow = await executeCandidateReadRoute({
    ...shared,
    input: {
      codeCanonicalReadAllowed: true,
      phase: "shadow_verify",
      dualReadRequested: true,
      canonicalReadRequested: false,
      reviewReadRequested: false,
      reconciliationEvidenceStatus: evidenceStatus,
      dualReadEvidenceStatus: "missing",
      canonicalCompatEvidenceStatus: "missing",
    },
  });
  assert.equal(shadow.source, "legacy");
  assert.equal(shadow.parity?.status, "pass");

  const compatibility = await executeCandidateReadRoute({
    ...shared,
    referencePairRead: async () => ({
      sameDatabaseSnapshot: true as const,
      reference: legacy,
      candidate: driftedCandidate,
    }),
    input: {
      codeCanonicalReadAllowed: true,
      phase: "canonical_compat",
      dualReadRequested: true,
      canonicalReadRequested: true,
      reviewReadRequested: true,
      reconciliationEvidenceStatus: evidenceStatus,
      dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
      canonicalCompatEvidenceStatus: "missing",
    },
  });
  assert.equal(compatibility.source, "legacy_fallback");
  assert.equal(compatibility.parity.status, "fail");
  assert.deepEqual(compatibility.blockers, ["canonical_compat_parity_not_pass"]);
});

test("canonical authority never silently falls back to legacy on Candidate failure", async () => {
  const legacy = await readyRead();
  const unavailable = await new CandidateCanonicalReadModel(mockReadAdapter({ fail: true })).read({ policy: readPolicy });
  let legacyCalls = 0;
  const result = await executeCandidateReadRoute({
    input: {
      codeCanonicalReadAllowed: true,
      phase: "canonical",
      dualReadRequested: false,
      canonicalReadRequested: true,
      reviewReadRequested: true,
      reconciliationEvidenceStatus: evidenceStatus,
      dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
      canonicalCompatEvidenceStatus: "PASS_CANONICAL_COMPAT_OBSERVATION",
    },
    legacyRead: async () => {
      legacyCalls += 1;
      return legacy;
    },
    candidateRead: async () => unavailable,
    referencePairRead: async () => ({
      sameDatabaseSnapshot: true as const,
      reference: legacy,
      candidate: unavailable,
    }),
  });
  assert.equal(result.source, "candidate");
  assert.equal(result.result.status, "unavailable");
  assert.equal(legacyCalls, 0);
});

function paritySample(index: number, phase: "shadow_verify" | "canonical_compat" = "shadow_verify") {
  return {
    schemaVersion: "candidate-read-parity-sample.v2" as const,
    sampledAt: new Date(Date.parse("2026-07-12T00:00:00.000Z") + index * 300_000).toISOString(),
    releaseId: "candidate-shadow-release-test",
    authorityEpoch: 2,
    phase,
    referenceStatus: "ready" as const,
    candidateStatus: "ready" as const,
    differenceCount: 0,
    comparisonHash: `sha256:${index.toString(16).padStart(64, "0")}`,
  };
}

test("read authority requires separate 24h zero-difference evidence windows", () => {
  const dualSamples = Array.from({ length: 289 }, (_, index) => paritySample(index));
  const dual = evaluateCandidateReadParityEvidence({
    authorityEpoch: 2,
    mode: "dual_read",
    releaseId: "candidate-shadow-release-test",
    samples: dualSamples,
  });
  assert.equal(dual.status, "PASS_DUAL_READ_OBSERVATION");
  assert.equal(dual.coverageHours, 24);
  assert.equal(dual.sampleCount, 289);
  assert.equal(dual.automaticPhaseAdvance, false);

  const compatibility = evaluateCandidateReadParityEvidence({
    authorityEpoch: 3,
    mode: "canonical_compat",
    releaseId: "candidate-shadow-release-test",
    samples: dualSamples.map((sample) => ({
      ...sample,
      authorityEpoch: 3,
      phase: "canonical_compat" as const,
    })),
  });
  assert.equal(compatibility.status, "PASS_CANONICAL_COMPAT_OBSERVATION");

  const drifted = dualSamples.map((sample, index) => ({
    ...sample,
    differenceCount: index === 200 ? 1 : 0,
  }));
  const failed = evaluateCandidateReadParityEvidence({
    authorityEpoch: 2,
    mode: "dual_read",
    releaseId: "candidate-shadow-release-test",
    samples: drifted,
  });
  assert.equal(failed.status, "FAIL_READ_PARITY_OBSERVATION");
  assert.ok(failed.violations.includes("read_observation_difference_present"));
  assert.equal(failed.evidenceHash, null);

  const insufficient = evaluateCandidateReadParityEvidence({
    authorityEpoch: 2,
    mode: "dual_read",
    releaseId: "candidate-shadow-release-test",
    samples: dualSamples.slice(0, 288),
  });
  assert.equal(insufficient.status, "FAIL_READ_PARITY_OBSERVATION");
  assert.ok(insufficient.violations.includes("read_observation_samples_insufficient"));
  assert.ok(insufficient.violations.includes("read_observation_window_too_short"));

  const gap = dualSamples.map((sample, index) => index < 145 ? sample : {
    ...sample,
    sampledAt: new Date(Date.parse(sample.sampledAt) + 301_000).toISOString(),
  });
  const gapFailure = evaluateCandidateReadParityEvidence({
    authorityEpoch: 2,
    mode: "dual_read",
    releaseId: "candidate-shadow-release-test",
    samples: gap,
  });
  assert.equal(gapFailure.status, "FAIL_READ_PARITY_OBSERVATION");
  assert.ok(gapFailure.violations.includes("read_observation_sample_gap_exceeded"));

  const unavailableSample = dualSamples.map((sample, index) => index === 100 ? {
    ...sample,
    candidateStatus: "unavailable" as const,
    differenceCount: null,
    comparisonHash: null,
  } : sample);
  const unavailableFailure = evaluateCandidateReadParityEvidence({
    authorityEpoch: 2,
    mode: "dual_read",
    releaseId: "candidate-shadow-release-test",
    samples: unavailableSample,
  });
  assert.equal(unavailableFailure.status, "FAIL_READ_PARITY_OBSERVATION");
  assert.ok(unavailableFailure.violations.includes("read_observation_source_unavailable"));
  assert.ok(unavailableFailure.violations.includes("read_observation_difference_present"));
});
