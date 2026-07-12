import assert from "node:assert/strict";
import test from "node:test";
import {
  CandidateCanonicalReadOracleCoordinator,
  buildCandidateCanonicalOracleFromRaw,
  type CandidateCanonicalOracleRaw,
} from "./canonical-read-oracle";
import {
  compareCandidateCanonicalReferenceReads,
  executeCandidateReadRoute,
} from "./canonical-read-model";
import { buildLegacyCandidateDiagnosticRead } from "./legacy-read-diagnostic";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";

const policy = {
  scope: "production_radar",
  asOf: "2026-07-12T01:00:00.000Z",
  releaseId: "candidate-shadow-release-test",
  checkpointKind: "1h",
  evidenceGradeVersion: "eg.v1",
  observationCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
  dueCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
} as const;

const episode = {
  schema_version: "candidate-episode.v1",
  scope: "production_radar",
  episode_id: "018f47d6-2c40-7e30-8a20-000000000001",
  canonical_instrument_id: "BINANCE:BTCUSDT:PERP",
  venue_context: { venue: "BINANCE" },
  first_seen_at: "2026-07-12T00:05:00.000Z",
  last_seen_at: "2026-07-12T00:10:00.000Z",
  observation_price: null,
  observation_price_fact_id: null,
  discovery_reasons: ["light_scan_candidate"],
  priority_tier: "A",
  lifecycle: "discovered" as const,
  maturity: "light_candidate" as const,
  direction_state: "unknown" as const,
  expires_at: null,
  closed_at: null,
  closed_reason: null,
  parent_episode_id: null,
  release_id: policy.releaseId,
  source_scan_cycle_id: "scan-1",
  row_version: "1",
};

const completedCheckpoint = {
  checkpoint_id: "018f47d6-2c40-7e30-8a20-000000000011",
  scope: "production_radar",
  episode_id: episode.episode_id,
  checkpoint_kind: "1h" as const,
  due_at: "2026-07-12T00:20:00.000Z",
  status: "completed" as const,
  release_id: policy.releaseId,
};

const retryCheckpoint = {
  ...completedCheckpoint,
  checkpoint_id: "018f47d6-2c40-7e30-8a20-000000000012",
  due_at: "2026-07-12T00:25:00.000Z",
  status: "retry_wait" as const,
};

const outcome = {
  outcome_id: "018f47d6-2c40-7e30-8a20-000000000021",
  scope: "production_radar",
  checkpoint_id: completedCheckpoint.checkpoint_id,
  episode_id: episode.episode_id,
  status: "recorded" as const,
  evidence_grade: true,
  evidence_grade_version: "eg.v1",
  mfe: "0.12",
  mae: "-0.03",
  recorded_at: "2026-07-12T00:21:00.000Z",
  release_id: policy.releaseId,
};

const raw: CandidateCanonicalOracleRaw = {
  databaseNow: policy.asOf,
  episodes: [episode],
  checkpoints: [completedCheckpoint, retryCheckpoint],
  outcomes: [outcome],
};

test("independent raw-table oracle preserves nulls and recomputes authoritative denominators", () => {
  const reference = buildCandidateCanonicalOracleFromRaw({ policy, raw });
  assert.equal(reference.status, "ready");
  if (reference.status !== "ready") return;
  assert.equal(reference.episodes[0]?.directionState, "unknown");
  assert.equal(reference.episodes[0]?.observationPrice, null);
  assert.equal(reference.review.counts.totalEpisodes, 1);
  assert.equal(reference.review.counts.dueCheckpoints, 2);
  assert.equal(reference.review.counts.terminalOutcomes, 1);
  assert.equal(reference.review.counts.pendingWithErrorCheckpoints, 1);
  assert.equal(reference.review.counts.metricSampleCount, 1);
  assert.equal(reference.review.rates.outcomeCompletion.percentage, 50);
  assert.deepEqual(reference.review.rates.outcomeCompletion.excludedReasons, {
    pending_with_error: 1,
  });
  assert.equal(reference.canCreateTradePlan, false);
  assert.equal(reference.canMutateLiveRanking, false);
});

test("oracle rejects duplicate authority rows and never turns corruption into ready", () => {
  const duplicate = buildCandidateCanonicalOracleFromRaw({
    policy,
    raw: {
      ...raw,
      outcomes: [outcome, { ...outcome, outcome_id: "018f47d6-2c40-7e30-8a20-000000000022" }],
    },
  });
  assert.equal(duplicate.status, "partial");
  if (duplicate.status !== "partial") return;
  assert.ok(duplicate.blockers.includes(
    `oracle_duplicate_outcome_for_checkpoint:${completedCheckpoint.checkpoint_id}`,
  ));
  assert.equal(duplicate.canCreateTradePlan, false);

  const secondEpisode = {
    ...episode,
    episode_id: "018f47d6-2c40-7e30-8a20-000000000002",
    canonical_instrument_id: "BINANCE:ETHUSDT:PERP",
  };
  const lineage = buildCandidateCanonicalOracleFromRaw({
    policy,
    raw: {
      ...raw,
      episodes: [episode, secondEpisode],
      outcomes: [{ ...outcome, episode_id: secondEpisode.episode_id }],
    },
  });
  assert.equal(lineage.status, "partial");
  if (lineage.status !== "partial") return;
  assert.ok(lineage.blockers.includes(`oracle_outcome_episode_mismatch:${outcome.outcome_id}`));
});

test("oracle preserves millisecond cohort boundaries and normalizes numeric averages", () => {
  const millisecondPolicy = {
    ...policy,
    asOf: "2026-07-12T00:30:00.300Z",
    observationCohort: {
      from: "2026-07-12T00:05:00.100Z",
      toExclusive: "2026-07-12T00:05:00.200Z",
    },
  } as const;
  const secondCheckpoint = {
    ...retryCheckpoint,
    status: "completed" as const,
  };
  const reference = buildCandidateCanonicalOracleFromRaw({
    policy: millisecondPolicy,
    raw: {
      databaseNow: millisecondPolicy.asOf,
      episodes: [{ ...episode, first_seen_at: new Date("2026-07-12T00:05:00.150Z") }],
      checkpoints: [completedCheckpoint, secondCheckpoint],
      outcomes: [
        { ...outcome, mfe: "0.12345678", mae: "-0.10" },
        {
          ...outcome,
          outcome_id: "018f47d6-2c40-7e30-8a20-000000000022",
          checkpoint_id: secondCheckpoint.checkpoint_id,
          mfe: "0.87654321",
          mae: "-0.20",
        },
      ],
    },
  });
  assert.equal(reference.status, "ready");
  if (reference.status !== "ready") return;
  assert.equal(reference.episodes.length, 1);
  assert.equal(reference.episodes[0]?.firstSeenAt, "2026-07-12T00:05:00.150Z");
  assert.equal(reference.review.metricAverages.mfe, 0.5);
  assert.equal(reference.review.metricAverages.mae, -0.15);
});

test("reference parity detects candidate drift including null-to-zero and policy changes", () => {
  const reference = buildCandidateCanonicalOracleFromRaw({ policy, raw });
  assert.equal(reference.status, "ready");
  if (reference.status !== "ready") return;
  assert.equal(compareCandidateCanonicalReferenceReads(reference, structuredClone(reference)).status, "pass");
  const zero = {
    ...reference,
    episodes: reference.episodes.map((item) => ({ ...item, observationPrice: "0" })),
  };
  const zeroParity = compareCandidateCanonicalReferenceReads(reference, zero);
  assert.equal(zeroParity.status, "fail");
  assert.ok(zeroParity.differences.includes("episodes[0].observationPrice"));
  const policyDrift = {
    ...reference,
    policy: { ...reference.policy, releaseId: "candidate-other-release" },
  };
  assert.ok(compareCandidateCanonicalReferenceReads(reference, policyDrift)
    .differences.includes("policy.releaseId"));
});

test("coordinator compares aggregate query and raw oracle inside one read-only snapshot", async () => {
  let transactionOptions: unknown;
  let transactions = 0;
  const reviewRow = {
    database_now: policy.asOf,
    active_episodes: "1",
    claimed_checkpoints: "0",
    closed_episodes: "0",
    completed_checkpoints: "1",
    data_unavailable_outcomes: "0",
    due_checkpoints: "2",
    evidence_grade_outcomes: "1",
    missed_outcomes: "0",
    metric_sample_count: "1",
    pending_checkpoints: "0",
    pending_with_error_checkpoints: "1",
    recorded_outcomes: "1",
    retry_waiting_checkpoints: "1",
    scheduled_checkpoints: "2",
    terminal_outcomes: "1",
    total_episodes: "1",
    average_mae: "-0.03",
    average_mfe: "0.12",
    excluded_reasons: {},
  };
  const tx: TransactionContext = {
    async query<T>(sql: string) {
      if (sql.startsWith("SELECT clock_timestamp")) return { rows: [{ database_now: policy.asOf }] as T[] };
      if (sql.includes("WITH\n          episode_cohort")) return { rows: [reviewRow] as T[] };
      if (sql.includes("ORDER BY first_seen_at DESC")) return { rows: [episode] as T[] };
      if (sql.includes("FROM candidate_authority.candidate_episodes")) return { rows: [episode] as T[] };
      if (sql.includes("FROM candidate_authority.candidate_episode_outcomes")) return { rows: [outcome] as T[] };
      if (sql.includes("FROM candidate_authority.candidate_episode_checkpoints")) {
        return { rows: [completedCheckpoint, retryCheckpoint] as T[] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    async withSavepoint<T>(work: (nested: TransactionContext) => Promise<T>) {
      return work(this);
    },
  };
  const adapter = {
    async withTransaction<T>(options: unknown, work: (nested: TransactionContext) => Promise<T>) {
      transactions += 1;
      transactionOptions = options;
      return work(tx);
    },
  } as PostgresTransactionAdapter;
  const result = await new CandidateCanonicalReadOracleCoordinator(adapter).compare({ policy });
  assert.equal(result.status, "pass");
  assert.equal(result.sameDatabaseSnapshot, true);
  assert.equal(result.parity?.differenceCount, 0);
  assert.equal(transactions, 1);
  assert.deepEqual(transactionOptions, {
    deferrable: true,
    idleInTransactionTimeoutMs: 30_000,
    isolation: "serializable",
    lockTimeoutMs: 1_000,
    maxRetries: 1,
    readOnly: true,
    statementTimeoutMs: 30_000,
  });
});

test("shadow route returns Legacy diagnostic while parity uses the independent reference", async () => {
  const reference = buildCandidateCanonicalOracleFromRaw({ policy, raw });
  assert.equal(reference.status, "ready");
  if (reference.status !== "ready") return;
  const legacy = buildLegacyCandidateDiagnosticRead({
    policy,
    events: [{
      id: "legacy-event-route",
      symbol: "BTCUSDT",
      title: "legacy",
      result: "watching",
      note: "diagnostic only",
      rankDelta: 0,
      createdAt: "2026-07-12T00:05:00.000Z",
      direction: "neutral",
    }],
  });
  const result = await executeCandidateReadRoute({
    input: {
      codeCanonicalReadAllowed: true,
      phase: "shadow_verify",
      dualReadRequested: true,
      canonicalReadRequested: false,
      reviewReadRequested: false,
      reconciliationEvidenceStatus: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
      dualReadEvidenceStatus: "missing",
      canonicalCompatEvidenceStatus: "missing",
    },
    legacyRead: async () => legacy,
    referencePairRead: async () => ({
      sameDatabaseSnapshot: true as const,
      reference,
      candidate: structuredClone(reference),
    }),
    candidateRead: async () => structuredClone(reference),
  });
  assert.equal(result.source, "legacy");
  assert.equal(result.result.authority, "legacy_projection_non_authoritative");
  assert.equal(result.result.canProveCanonicalParity, false);
  assert.equal(result.parity?.status, "pass");

  const splitSnapshot = await executeCandidateReadRoute({
    input: {
      codeCanonicalReadAllowed: true,
      phase: "canonical_compat",
      dualReadRequested: true,
      canonicalReadRequested: true,
      reviewReadRequested: true,
      reconciliationEvidenceStatus: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
      dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
      canonicalCompatEvidenceStatus: "missing",
    },
    legacyRead: async () => legacy,
    referencePairRead: async () => ({
      sameDatabaseSnapshot: false as unknown as true,
      reference,
      candidate: structuredClone(reference),
    }),
    candidateRead: async () => structuredClone(reference),
  });
  assert.equal(splitSnapshot.source, "legacy_fallback");
  assert.equal(splitSnapshot.parity.status, "unavailable");
  assert.deepEqual(splitSnapshot.parity.differences, ["reference_snapshot_not_shared"]);
});
