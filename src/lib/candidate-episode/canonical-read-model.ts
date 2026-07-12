import { createHash } from "node:crypto";
import type {
  CandidateCloseReason,
  CandidateDirectionState,
  CandidateLifecycle,
  CandidateMaturity,
} from "./candidate-episode-service";
import type { PostgresTransactionAdapter } from "./transaction-adapter";

export const CANDIDATE_CANONICAL_READ_SCHEMA_VERSION = "candidate-canonical-read.v1" as const;
export const CANDIDATE_CANONICAL_REVIEW_SCHEMA_VERSION = "candidate-review-read.v1" as const;
export const CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED = false as const;
export const CANDIDATE_READ_PAGE_MAXIMUM = 1_000;
export const CANDIDATE_READ_OBSERVATION_MINIMUM_HOURS = 24;
export const CANDIDATE_READ_OBSERVATION_MINIMUM_SAMPLES = 289;
export const CANDIDATE_READ_OBSERVATION_MAXIMUM_GAP_SECONDS = 600;
export const CANDIDATE_READ_AS_OF_MAXIMUM_AGE_SECONDS = 600;

export type CandidateCanonicalReadPolicy = Readonly<{
  scope: "production_radar";
  asOf: string;
  releaseId: string;
  checkpointKind: "1h" | "4h" | "24h";
  evidenceGradeVersion: "eg.v1";
  observationCohort: Readonly<{
    from: string;
    toExclusive: string;
  }>;
  dueCohort: Readonly<{
    from: string;
    toExclusive: string;
  }>;
}>;

export type CandidateCanonicalReadCursor = Readonly<{
  episodeId: string;
  firstSeenAt: string;
}>;

export type CandidateCanonicalEpisodeRead = Readonly<{
  schemaVersion: "candidate-episode.v1";
  scope: "production_radar";
  episodeId: string;
  canonicalInstrumentId: string;
  venueContext: Readonly<Record<string, unknown>>;
  firstSeenAt: string;
  lastSeenAt: string;
  observationPrice: string | null;
  observationPriceFactId: string | null;
  discoveryReasons: readonly string[];
  priorityTier: string;
  lifecycle: CandidateLifecycle;
  maturity: CandidateMaturity;
  directionState: CandidateDirectionState;
  expiresAt: string | null;
  closedAt: string | null;
  closedReason: CandidateCloseReason | null;
  parentEpisodeId: string | null;
  releaseId: string;
  sourceScanCycleId: string;
  rowVersion: number;
}>;

export type CandidateCanonicalReviewRead = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_REVIEW_SCHEMA_VERSION;
  counts: Readonly<{
    activeEpisodes: number;
    claimedCheckpoints: number;
    closedEpisodes: number;
    completedCheckpoints: number;
    dataUnavailableOutcomes: number;
    dueCheckpoints: number;
    evidenceGradeOutcomes: number;
    metricSampleCount: number;
    missedOutcomes: number;
    pendingCheckpoints: number;
    pendingWithErrorCheckpoints: number;
    recordedOutcomes: number;
    retryWaitingCheckpoints: number;
    scheduledCheckpoints: number;
    terminalOutcomes: number;
    totalEpisodes: number;
  }>;
  metricAverages: Readonly<{
    mae: number | null;
    mfe: number | null;
  }>;
  metricAdmission: Readonly<{
    denominator: number;
    denominatorLabel: "terminalOutcomes";
    excludedReasons: Readonly<Record<string, number>>;
    numerator: number;
    percentage: number | null;
  }>;
  rates: Readonly<{
    outcomeCompletion: CandidateCanonicalReviewRate;
    evidenceCoverage: CandidateCanonicalReviewRate;
    checkpointRecordingSuccess: CandidateCanonicalReviewRate;
  }>;
  invariants: Readonly<{
    completedCheckpointsEqualTerminalOutcomes: boolean;
    dueCheckpointsCoverTerminalOutcomes: boolean;
    episodePartitionReconciles: boolean;
    metricSamplesEqualEvidenceGradeOutcomes: boolean;
    terminalOutcomePartitionReconciles: boolean;
  }>;
}>;

export type CandidateCanonicalReviewRate = Readonly<{
  numerator: number;
  denominator: number;
  percentage: number | null;
  denominatorLabel: "dueCheckpoints";
  excludedReasons: Readonly<Record<string, number>>;
}>;

type CandidateCanonicalReadAvailable = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_READ_SCHEMA_VERSION;
  status: "ready" | "partial";
  authority: "candidate_authority";
  allowedUse: "candidate_lifecycle_and_review_only";
  canCreateTradePlan: false;
  canMutateLiveRanking: false;
  policy: CandidateCanonicalReadPolicy;
  databaseNow: string;
  episodes: readonly CandidateCanonicalEpisodeRead[];
  page: Readonly<{
    hasMore: boolean;
    nextCursor: CandidateCanonicalReadCursor | null;
    returned: number;
  }>;
  review: CandidateCanonicalReviewRead;
  blockers: readonly string[];
  contentHash: string;
}>;

export type CandidateCanonicalReadReady = CandidateCanonicalReadAvailable & Readonly<{
  status: "ready";
  blockers: readonly [];
}>;

export type CandidateCanonicalReadPartial = CandidateCanonicalReadAvailable & Readonly<{
  status: "partial";
  blockers: readonly string[];
}>;

export type CandidateCanonicalReadUnavailable = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_READ_SCHEMA_VERSION;
  status: "unavailable";
  authority: "candidate_authority";
  allowedUse: "candidate_lifecycle_and_review_only";
  canCreateTradePlan: false;
  canMutateLiveRanking: false;
  policy: null;
  reason: "candidate_database_read_failed" | "candidate_read_input_invalid";
  databaseNow: null;
  episodes: null;
  page: null;
  review: null;
  contentHash: null;
}>;

export type CandidateCanonicalReadResult =
  | CandidateCanonicalReadReady
  | CandidateCanonicalReadPartial
  | CandidateCanonicalReadUnavailable;

type EpisodeRow = {
  schema_version: string;
  scope: string;
  episode_id: string;
  canonical_instrument_id: string;
  venue_context: Readonly<Record<string, unknown>>;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  observation_price: number | string | null;
  observation_price_fact_id: string | null;
  discovery_reasons: string[];
  priority_tier: string;
  lifecycle: CandidateLifecycle;
  maturity: CandidateMaturity;
  direction_state: CandidateDirectionState;
  expires_at: Date | string | null;
  closed_at: Date | string | null;
  closed_reason: CandidateCloseReason | null;
  parent_episode_id: string | null;
  release_id: string;
  source_scan_cycle_id: string;
  row_version: number | string;
};

type ReviewRow = {
  database_now: Date | string;
  active_episodes: number | string;
  claimed_checkpoints: number | string;
  closed_episodes: number | string;
  completed_checkpoints: number | string;
  data_unavailable_outcomes: number | string;
  due_checkpoints: number | string;
  evidence_grade_outcomes: number | string;
  missed_outcomes: number | string;
  metric_sample_count: number | string;
  pending_checkpoints: number | string;
  pending_with_error_checkpoints: number | string;
  recorded_outcomes: number | string;
  retry_waiting_checkpoints: number | string;
  scheduled_checkpoints: number | string;
  terminal_outcomes: number | string;
  total_episodes: number | string;
  average_mae: number | string | null;
  average_mfe: number | string | null;
  excluded_reasons: Record<string, number | string> | null;
};

const READ_TRANSACTION = {
  deferrable: true,
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 1,
  readOnly: true,
  statementTimeoutMs: 30_000,
} as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function hash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("candidate_read_timestamp_invalid");
  return new Date(timestamp).toISOString();
}

function count(value: number | string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`candidate_read_count_invalid:${field}`);
  }
  return parsed;
}

function metric(value: number | string | null, field: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`candidate_read_metric_invalid:${field}`);
  return Object.is(parsed, -0) ? 0 : parsed;
}

function validCursor(cursor: CandidateCanonicalReadCursor | null | undefined) {
  if (!cursor) return null;
  if (typeof cursor.episodeId !== "string" || !/^[0-9a-f-]{36}$/.test(cursor.episodeId)) {
    throw new Error("candidate_read_cursor_invalid");
  }
  const firstSeenAt = iso(cursor.firstSeenAt);
  if (!firstSeenAt) throw new Error("candidate_read_cursor_invalid");
  return { episodeId: cursor.episodeId, firstSeenAt };
}

function validPolicy(policy: CandidateCanonicalReadPolicy | null | undefined) {
  if (!policy
      || policy.scope !== "production_radar"
      || policy.evidenceGradeVersion !== "eg.v1"
      || !["1h", "4h", "24h"].includes(policy.checkpointKind)
      || !/^[a-zA-Z0-9._:-]{1,160}$/.test(policy.releaseId)) {
    throw new Error("candidate_read_policy_invalid");
  }
  const asOf = iso(policy.asOf);
  const observationFrom = iso(policy.observationCohort.from);
  const observationToExclusive = iso(policy.observationCohort.toExclusive);
  const dueFrom = iso(policy.dueCohort.from);
  const dueToExclusive = iso(policy.dueCohort.toExclusive);
  if (!asOf || !observationFrom || !observationToExclusive || !dueFrom || !dueToExclusive
      || Date.parse(observationFrom) >= Date.parse(observationToExclusive)
      || Date.parse(dueFrom) >= Date.parse(dueToExclusive)
      || Date.parse(observationToExclusive) > Date.parse(asOf)
      || Date.parse(dueToExclusive) > Date.parse(asOf)) {
    throw new Error("candidate_read_policy_window_invalid");
  }
  return {
    scope: "production_radar",
    asOf,
    releaseId: policy.releaseId,
    checkpointKind: policy.checkpointKind,
    evidenceGradeVersion: "eg.v1",
    observationCohort: { from: observationFrom, toExclusive: observationToExclusive },
    dueCohort: { from: dueFrom, toExclusive: dueToExclusive },
  } as const satisfies CandidateCanonicalReadPolicy;
}

function mapEpisode(row: EpisodeRow): CandidateCanonicalEpisodeRead {
  const firstSeenAt = iso(row.first_seen_at);
  const lastSeenAt = iso(row.last_seen_at);
  if (row.schema_version !== "candidate-episode.v1"
      || row.scope !== "production_radar"
      || !firstSeenAt
      || !lastSeenAt) {
    throw new Error("candidate_episode_read_contract_invalid");
  }
  const rowVersion = count(row.row_version, "episode_row_version");
  if (rowVersion < 1) throw new Error("candidate_episode_row_version_invalid");
  return {
    schemaVersion: "candidate-episode.v1",
    scope: "production_radar",
    episodeId: row.episode_id,
    canonicalInstrumentId: row.canonical_instrument_id,
    venueContext: row.venue_context,
    firstSeenAt,
    lastSeenAt,
    observationPrice: row.observation_price === null ? null : String(row.observation_price),
    observationPriceFactId: row.observation_price_fact_id,
    discoveryReasons: [...row.discovery_reasons],
    priorityTier: row.priority_tier,
    lifecycle: row.lifecycle,
    maturity: row.maturity,
    directionState: row.direction_state,
    expiresAt: iso(row.expires_at),
    closedAt: iso(row.closed_at),
    closedReason: row.closed_reason,
    parentEpisodeId: row.parent_episode_id,
    releaseId: row.release_id,
    sourceScanCycleId: row.source_scan_cycle_id,
    rowVersion,
  };
}

function mapReview(row: ReviewRow): CandidateCanonicalReviewRead {
  const activeEpisodes = count(row.active_episodes, "active_episodes");
  const claimedCheckpoints = count(row.claimed_checkpoints, "claimed_checkpoints");
  const closedEpisodes = count(row.closed_episodes, "closed_episodes");
  const completedCheckpoints = count(row.completed_checkpoints, "completed_checkpoints");
  const dataUnavailableOutcomes = count(row.data_unavailable_outcomes, "data_unavailable_outcomes");
  const dueCheckpoints = count(row.due_checkpoints, "due_checkpoints");
  const terminalOutcomes = count(row.terminal_outcomes, "terminal_outcomes");
  const evidenceGradeOutcomes = count(row.evidence_grade_outcomes, "evidence_grade_outcomes");
  const missedOutcomes = count(row.missed_outcomes, "missed_outcomes");
  const metricSampleCount = count(row.metric_sample_count, "metric_sample_count");
  const pendingCheckpoints = count(row.pending_checkpoints, "pending_checkpoints");
  const pendingWithErrorCheckpoints = count(
    row.pending_with_error_checkpoints,
    "pending_with_error_checkpoints",
  );
  const recordedOutcomes = count(row.recorded_outcomes, "recorded_outcomes");
  const retryWaitingCheckpoints = count(row.retry_waiting_checkpoints, "retry_waiting_checkpoints");
  const totalEpisodes = count(row.total_episodes, "total_episodes");
  const excludedReasons = Object.fromEntries(
    Object.entries(row.excluded_reasons ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, value]) => [reason, count(value, `excluded_reason:${reason}`)]),
  );
  const completedWithoutOutcome = Math.max(0, completedCheckpoints - terminalOutcomes);
  const inProgressExclusions = Object.fromEntries(Object.entries({
    pending: pendingCheckpoints,
    claimed: claimedCheckpoints,
    pending_with_error: pendingWithErrorCheckpoints,
    completed_without_outcome: completedWithoutOutcome,
  }).filter(([, value]) => value > 0));
  const evidenceExclusions = Object.fromEntries(Object.entries({
    ...inProgressExclusions,
    ...excludedReasons,
  }).sort(([left], [right]) => left.localeCompare(right)));
  const percentage = (numerator: number, denominator: number) => (
    denominator === 0 ? null : (numerator / denominator) * 100
  );
  return {
    schemaVersion: CANDIDATE_CANONICAL_REVIEW_SCHEMA_VERSION,
    counts: {
      activeEpisodes,
      claimedCheckpoints,
      closedEpisodes,
      completedCheckpoints,
      dataUnavailableOutcomes,
      dueCheckpoints,
      evidenceGradeOutcomes,
      metricSampleCount,
      missedOutcomes,
      pendingCheckpoints,
      pendingWithErrorCheckpoints,
      recordedOutcomes,
      retryWaitingCheckpoints,
      scheduledCheckpoints: count(row.scheduled_checkpoints, "scheduled_checkpoints"),
      terminalOutcomes,
      totalEpisodes,
    },
    metricAverages: {
      mae: metric(row.average_mae, "average_mae"),
      mfe: metric(row.average_mfe, "average_mfe"),
    },
    metricAdmission: {
      denominator: terminalOutcomes,
      denominatorLabel: "terminalOutcomes",
      excludedReasons,
      numerator: evidenceGradeOutcomes,
      percentage: percentage(evidenceGradeOutcomes, terminalOutcomes),
    },
    rates: {
      outcomeCompletion: {
        numerator: terminalOutcomes,
        denominator: dueCheckpoints,
        percentage: percentage(terminalOutcomes, dueCheckpoints),
        denominatorLabel: "dueCheckpoints",
        excludedReasons: inProgressExclusions,
      },
      evidenceCoverage: {
        numerator: evidenceGradeOutcomes,
        denominator: dueCheckpoints,
        percentage: percentage(evidenceGradeOutcomes, dueCheckpoints),
        denominatorLabel: "dueCheckpoints",
        excludedReasons: evidenceExclusions,
      },
      checkpointRecordingSuccess: {
        numerator: evidenceGradeOutcomes,
        denominator: dueCheckpoints,
        percentage: percentage(evidenceGradeOutcomes, dueCheckpoints),
        denominatorLabel: "dueCheckpoints",
        excludedReasons: evidenceExclusions,
      },
    },
    invariants: {
      completedCheckpointsEqualTerminalOutcomes: completedCheckpoints === terminalOutcomes,
      dueCheckpointsCoverTerminalOutcomes: dueCheckpoints >= terminalOutcomes,
      episodePartitionReconciles: totalEpisodes === activeEpisodes + closedEpisodes,
      metricSamplesEqualEvidenceGradeOutcomes: metricSampleCount === evidenceGradeOutcomes,
      terminalOutcomePartitionReconciles:
        terminalOutcomes === recordedOutcomes + missedOutcomes + dataUnavailableOutcomes,
    },
  };
}

function unavailable(
  reason: CandidateCanonicalReadUnavailable["reason"],
): CandidateCanonicalReadUnavailable {
  return {
    schemaVersion: CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
    status: "unavailable",
    authority: "candidate_authority",
    allowedUse: "candidate_lifecycle_and_review_only",
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    policy: null,
    reason,
    databaseNow: null,
    episodes: null,
    page: null,
    review: null,
    contentHash: null,
  };
}

export class CandidateCanonicalReadModel {
  constructor(private readonly transactions: PostgresTransactionAdapter) {}

  async read({
    cursor,
    limit = 100,
    policy,
  }: {
    cursor?: CandidateCanonicalReadCursor | null;
    limit?: number;
    policy: CandidateCanonicalReadPolicy;
  }): Promise<CandidateCanonicalReadResult> {
    if (!Number.isSafeInteger(limit)
        || limit < 1
        || limit > CANDIDATE_READ_PAGE_MAXIMUM) {
      return unavailable("candidate_read_input_invalid");
    }
    let parsedCursor: CandidateCanonicalReadCursor | null;
    let parsedPolicy: CandidateCanonicalReadPolicy;
    try {
      parsedCursor = validCursor(cursor);
      parsedPolicy = validPolicy(policy);
    } catch {
      return unavailable("candidate_read_input_invalid");
    }

    try {
      return await this.transactions.withTransaction(READ_TRANSACTION, async (tx) => {
        const episodesResult = await tx.query<EpisodeRow>(`SELECT
          schema_version, scope, episode_id, canonical_instrument_id, venue_context,
          first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
          discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
          expires_at, closed_at, closed_reason, parent_episode_id, release_id,
          source_scan_cycle_id, row_version
        FROM candidate_authority.candidate_episodes
        WHERE scope=$1
          AND release_id=$2
          AND first_seen_at >= $3::timestamptz
          AND first_seen_at < $4::timestamptz
          AND first_seen_at <= $5::timestamptz
          AND ($6::timestamptz IS NULL OR (first_seen_at, episode_id) < ($6::timestamptz, $7::uuid))
        ORDER BY first_seen_at DESC, episode_id DESC
        LIMIT $8`, [
          parsedPolicy.scope,
          parsedPolicy.releaseId,
          parsedPolicy.observationCohort.from,
          parsedPolicy.observationCohort.toExclusive,
          parsedPolicy.asOf,
          parsedCursor?.firstSeenAt ?? null,
          parsedCursor?.episodeId ?? null,
          limit + 1,
        ]);
        const reviewResult = await tx.query<ReviewRow>(`WITH
          episode_cohort AS (
            SELECT scope, episode_id, lifecycle
            FROM candidate_authority.candidate_episodes
            WHERE scope=$1 AND release_id=$2
              AND first_seen_at >= $3::timestamptz
              AND first_seen_at < $4::timestamptz
              AND first_seen_at <= $8::timestamptz
          ), episode_counts AS (
            SELECT count(*)::bigint AS total_episodes,
              count(*) FILTER (WHERE lifecycle='closed')::bigint AS closed_episodes,
              count(*) FILTER (WHERE lifecycle<>'closed')::bigint AS active_episodes
            FROM episode_cohort
          ), checkpoint_cohort AS (
            SELECT checkpoint.*
            FROM candidate_authority.candidate_episode_checkpoints checkpoint
            INNER JOIN episode_cohort episode
              ON episode.scope=checkpoint.scope AND episode.episode_id=checkpoint.episode_id
            WHERE checkpoint.scope=$1 AND checkpoint.release_id=$2
              AND checkpoint.checkpoint_kind=$5
              AND checkpoint.due_at >= $6::timestamptz
              AND checkpoint.due_at < $7::timestamptz
              AND checkpoint.due_at <= $8::timestamptz
          ), checkpoint_counts AS (
            SELECT count(*)::bigint AS scheduled_checkpoints,
              count(*) FILTER (WHERE status='pending')::bigint AS pending_checkpoints,
              count(*) FILTER (WHERE status='claimed')::bigint AS claimed_checkpoints,
              count(*) FILTER (WHERE status='retry_wait')::bigint AS retry_waiting_checkpoints,
              count(*) FILTER (WHERE status='retry_wait')::bigint AS pending_with_error_checkpoints,
              count(*) FILTER (WHERE status='completed')::bigint AS completed_checkpoints,
              count(*)::bigint AS due_checkpoints
            FROM checkpoint_cohort
          ), outcome_cohort AS (
            SELECT outcome.*
            FROM candidate_authority.candidate_episode_outcomes outcome
            INNER JOIN checkpoint_cohort checkpoint
              ON checkpoint.scope=outcome.scope AND checkpoint.checkpoint_id=outcome.checkpoint_id
            WHERE outcome.scope=$1 AND outcome.release_id=$2
              AND outcome.recorded_at <= $8::timestamptz
          ), outcome_counts AS (
            SELECT count(*)::bigint AS terminal_outcomes,
              count(*) FILTER (WHERE status='recorded')::bigint AS recorded_outcomes,
              count(*) FILTER (WHERE status='missed')::bigint AS missed_outcomes,
              count(*) FILTER (WHERE status='data_unavailable')::bigint AS data_unavailable_outcomes,
              count(*) FILTER (WHERE evidence_grade AND evidence_grade_version=$9)::bigint AS evidence_grade_outcomes,
              count(*) FILTER (WHERE evidence_grade AND evidence_grade_version=$9
                AND mfe IS NOT NULL AND mae IS NOT NULL)::bigint AS metric_sample_count,
              avg(mfe) FILTER (WHERE evidence_grade AND evidence_grade_version=$9) AS average_mfe,
              avg(mae) FILTER (WHERE evidence_grade AND evidence_grade_version=$9) AS average_mae
            FROM outcome_cohort
          ), excluded AS (
            SELECT COALESCE(jsonb_object_agg(reason, total), '{}'::jsonb) AS excluded_reasons
            FROM (
              SELECT CASE
                WHEN evidence_grade_version<>$9 THEN 'evidence_version_mismatch'
                WHEN status='missed' THEN 'missed'
                WHEN status='data_unavailable' THEN 'data_unavailable'
                ELSE 'evidence_grade_false'
              END AS reason, count(*)::bigint AS total
              FROM outcome_cohort
              WHERE NOT evidence_grade OR evidence_grade_version<>$9
              GROUP BY 1
            ) reasons
          ) SELECT clock_timestamp() AS database_now,
            episode_counts.*, checkpoint_counts.*, outcome_counts.*, excluded.excluded_reasons
          FROM episode_counts CROSS JOIN checkpoint_counts CROSS JOIN outcome_counts CROSS JOIN excluded`, [
          parsedPolicy.scope,
          parsedPolicy.releaseId,
          parsedPolicy.observationCohort.from,
          parsedPolicy.observationCohort.toExclusive,
          parsedPolicy.checkpointKind,
          parsedPolicy.dueCohort.from,
          parsedPolicy.dueCohort.toExclusive,
          parsedPolicy.asOf,
          parsedPolicy.evidenceGradeVersion,
        ]);
        const reviewRow = reviewResult.rows[0];
        if (!reviewRow) throw new Error("candidate_review_read_missing");
        const hasMore = episodesResult.rows.length > limit;
        const episodes = episodesResult.rows.slice(0, limit).map(mapEpisode);
        const last = episodes.at(-1);
        const review = mapReview(reviewRow);
        const databaseNow = iso(reviewRow.database_now);
        if (!databaseNow) throw new Error("candidate_database_clock_missing");
        const asOfAgeSeconds = (Date.parse(databaseNow) - Date.parse(parsedPolicy.asOf)) / 1_000;
        const page = {
          hasMore,
          nextCursor: hasMore && last
            ? { episodeId: last.episodeId, firstSeenAt: last.firstSeenAt }
            : null,
          returned: episodes.length,
        } as const;
        const blockers = [
          ...Object.entries(review.invariants)
            .filter(([, passed]) => !passed)
            .map(([name]) => `candidate_review_invariant_failed:${name}`),
          ...(asOfAgeSeconds < 0 ? ["candidate_read_as_of_after_database_clock"] : []),
          ...(asOfAgeSeconds > CANDIDATE_READ_AS_OF_MAXIMUM_AGE_SECONDS
            ? ["candidate_read_as_of_stale_for_current_snapshot"]
            : []),
        ];
        const contentHash = hash({ policy: parsedPolicy, episodes, page, review });
        const common = {
          schemaVersion: CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
          authority: "candidate_authority",
          allowedUse: "candidate_lifecycle_and_review_only",
          canCreateTradePlan: false,
          canMutateLiveRanking: false,
          policy: parsedPolicy,
          databaseNow,
          episodes,
          page,
          review,
          contentHash,
        } as const;
        if (blockers.length > 0) {
          return { ...common, status: "partial", blockers } as const;
        }
        return { ...common, status: "ready", blockers: [] } as const;
      });
    } catch {
      return unavailable("candidate_database_read_failed");
    }
  }
}

export type CandidateReadParity = Readonly<{
  status: "pass" | "fail" | "unavailable";
  differenceCount: number | null;
  differences: readonly string[];
  comparisonHash: string | null;
}>;

export type CandidateReadParitySample = Readonly<{
  schemaVersion: "candidate-read-parity-sample.v1";
  sampledAt: string;
  releaseId: string;
  authorityEpoch: number;
  phase: "shadow_verify" | "canonical_compat";
  legacyStatus: "ready" | "partial" | "unavailable";
  candidateStatus: "ready" | "partial" | "unavailable";
  differenceCount: number | null;
  comparisonHash: string | null;
}>;

export function evaluateCandidateReadParityEvidence({
  authorityEpoch,
  mode,
  releaseId,
  samples,
}: {
  authorityEpoch: number;
  mode: "dual_read" | "canonical_compat";
  releaseId: string;
  samples: readonly CandidateReadParitySample[];
}) {
  const violations: string[] = [];
  const ordered = [...samples].sort((left, right) => left.sampledAt.localeCompare(right.sampledAt));
  if (!Number.isSafeInteger(authorityEpoch) || authorityEpoch < 1) violations.push("authority_epoch_invalid");
  if (!releaseId.trim()) violations.push("release_id_missing");
  if (ordered.length < CANDIDATE_READ_OBSERVATION_MINIMUM_SAMPLES) {
    violations.push("read_observation_samples_insufficient");
  }
  let maximumGapSeconds = 0;
  let previousTime: number | null = null;
  for (const sample of ordered) {
    const sampledAt = Date.parse(sample.sampledAt);
    if (!Number.isFinite(sampledAt)) {
      violations.push("read_observation_sample_time_invalid");
      continue;
    }
    if (previousTime !== null) {
      const gap = (sampledAt - previousTime) / 1_000;
      if (gap <= 0) violations.push("read_observation_sample_order_invalid");
      maximumGapSeconds = Math.max(maximumGapSeconds, gap);
    }
    previousTime = sampledAt;
    const expectedPhase = mode === "dual_read" ? "shadow_verify" : "canonical_compat";
    if (sample.schemaVersion !== "candidate-read-parity-sample.v1") violations.push("read_observation_schema_mismatch");
    if (sample.releaseId !== releaseId) violations.push("read_observation_release_mismatch");
    if (sample.authorityEpoch !== authorityEpoch) violations.push("read_observation_epoch_mismatch");
    if (sample.phase !== expectedPhase) violations.push("read_observation_phase_mismatch");
    if (sample.legacyStatus !== "ready" || sample.candidateStatus !== "ready") {
      violations.push("read_observation_source_unavailable");
    }
    if (sample.differenceCount !== 0) violations.push("read_observation_difference_present");
    if (!/^sha256:[0-9a-f]{64}$/.test(sample.comparisonHash ?? "")) {
      violations.push("read_observation_comparison_hash_invalid");
    }
  }
  if (maximumGapSeconds > CANDIDATE_READ_OBSERVATION_MAXIMUM_GAP_SECONDS) {
    violations.push("read_observation_sample_gap_exceeded");
  }
  const first = ordered[0] ? Date.parse(ordered[0].sampledAt) : Number.NaN;
  const lastSample = ordered.at(-1);
  const last = lastSample ? Date.parse(lastSample.sampledAt) : Number.NaN;
  const coverageHours = Number.isFinite(first) && Number.isFinite(last)
    ? (last - first) / (60 * 60 * 1_000)
    : 0;
  if (coverageHours < CANDIDATE_READ_OBSERVATION_MINIMUM_HOURS) {
    violations.push("read_observation_window_too_short");
  }
  const uniqueViolations = [...new Set(violations)];
  const passStatus = mode === "dual_read"
    ? "PASS_DUAL_READ_OBSERVATION"
    : "PASS_CANONICAL_COMPAT_OBSERVATION";
  return {
    schemaVersion: "candidate-read-parity-evidence.v1",
    status: uniqueViolations.length === 0 ? passStatus : "FAIL_READ_PARITY_OBSERVATION",
    mode,
    releaseId,
    authorityEpoch,
    sampleCount: ordered.length,
    coverageHours,
    maximumGapSeconds,
    automaticPhaseAdvance: false,
    evidenceHash: uniqueViolations.length === 0
      ? hash({ authorityEpoch, mode, releaseId, samples: ordered })
      : null,
    violations: uniqueViolations,
  } as const;
}

function collectDifferences(
  left: unknown,
  right: unknown,
  path: string,
  differences: string[],
) {
  if (Object.is(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) differences.push(`${path}.length`);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      collectDifferences(left[index], right[index], `${path}[${index}]`, differences);
    }
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      collectDifferences(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        differences,
      );
    }
    return;
  }
  differences.push(path);
}

function parityPayload(read: CandidateCanonicalReadReady) {
  return {
    episodes: [...read.episodes].sort((left, right) => left.episodeId.localeCompare(right.episodeId)),
    page: read.page,
    review: read.review,
  };
}

export function compareCandidateCanonicalReads(
  legacy: CandidateCanonicalReadResult,
  candidate: CandidateCanonicalReadResult,
): CandidateReadParity {
  if (legacy.status !== "ready" || candidate.status !== "ready") {
    return {
      status: "unavailable",
      differenceCount: null,
      differences: [legacy.status !== "ready" ? "legacy_unavailable" : "candidate_unavailable"],
      comparisonHash: null,
    };
  }
  const left = parityPayload(legacy);
  const right = parityPayload(candidate);
  const differences: string[] = [];
  collectDifferences(left, right, "", differences);
  return {
    status: differences.length === 0 ? "pass" : "fail",
    differenceCount: differences.length,
    differences: differences.slice(0, 100),
    comparisonHash: hash({ left, right }),
  };
}

export type CandidateReadRouteInput = Readonly<{
  codeCanonicalReadAllowed: boolean;
  phase: "legacy" | "shadow_capture" | "shadow_verify" | "canonical_compat" | "canonical";
  dualReadRequested: boolean;
  canonicalReadRequested: boolean;
  reviewReadRequested: boolean;
  reconciliationEvidenceStatus:
    | "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
    | "missing";
  dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION" | "missing";
  canonicalCompatEvidenceStatus: "PASS_CANONICAL_COMPAT_OBSERVATION" | "missing";
}>;

export type CandidateReadRouteMode =
  | "legacy_only"
  | "dual_read_legacy_authority"
  | "canonical_compat"
  | "canonical_only";

export function evaluateCandidateReadRoute(input: CandidateReadRouteInput): Readonly<{
  mode: CandidateReadRouteMode;
  blockers: readonly string[];
}> {
  if (!input.codeCanonicalReadAllowed) {
    return { mode: "legacy_only", blockers: ["canonical_read_not_authorized_in_code"] };
  }
  if (input.phase === "legacy" || input.phase === "shadow_capture") {
    return { mode: "legacy_only", blockers: ["candidate_phase_not_readable"] };
  }
  if (input.reconciliationEvidenceStatus
      !== "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL") {
    return { mode: "legacy_only", blockers: ["reconciliation_evidence_missing"] };
  }
  if (input.phase === "shadow_verify") {
    if (input.dualReadRequested && !input.canonicalReadRequested && !input.reviewReadRequested) {
      return { mode: "dual_read_legacy_authority", blockers: [] };
    }
    return { mode: "legacy_only", blockers: ["shadow_verify_flag_combination_invalid"] };
  }
  if (input.phase === "canonical_compat") {
    if (input.dualReadEvidenceStatus !== "PASS_DUAL_READ_OBSERVATION") {
      return { mode: "legacy_only", blockers: ["dual_read_observation_evidence_missing"] };
    }
    if (input.dualReadRequested && input.canonicalReadRequested && input.reviewReadRequested) {
      return { mode: "canonical_compat", blockers: [] };
    }
    return { mode: "legacy_only", blockers: ["canonical_compat_flag_combination_invalid"] };
  }
  if (input.canonicalCompatEvidenceStatus !== "PASS_CANONICAL_COMPAT_OBSERVATION") {
    return { mode: "legacy_only", blockers: ["canonical_compat_observation_evidence_missing"] };
  }
  if (!input.dualReadRequested && input.canonicalReadRequested && input.reviewReadRequested) {
    return { mode: "canonical_only", blockers: [] };
  }
  return { mode: "legacy_only", blockers: ["canonical_flag_combination_invalid"] };
}

export async function executeCandidateReadRoute({
  candidateRead,
  input,
  legacyRead,
}: {
  candidateRead: () => Promise<CandidateCanonicalReadResult>;
  input: CandidateReadRouteInput;
  legacyRead: () => Promise<CandidateCanonicalReadResult>;
}) {
  const route = evaluateCandidateReadRoute(input);
  if (route.mode === "legacy_only") {
    return { mode: route.mode, source: "legacy", result: await legacyRead(), parity: null, blockers: route.blockers } as const;
  }
  if (route.mode === "canonical_only") {
    return { mode: route.mode, source: "candidate", result: await candidateRead(), parity: null, blockers: [] } as const;
  }
  const legacy = await legacyRead();
  const candidate = await candidateRead();
  const parity = compareCandidateCanonicalReads(legacy, candidate);
  if (route.mode === "dual_read_legacy_authority") {
    return { mode: route.mode, source: "legacy", result: legacy, parity, blockers: [] } as const;
  }
  if (parity.status === "pass") {
    return { mode: route.mode, source: "candidate", result: candidate, parity, blockers: [] } as const;
  }
  return {
    mode: route.mode,
    source: "legacy_fallback",
    result: legacy,
    parity,
    blockers: ["canonical_compat_parity_not_pass"],
  } as const;
}

export function evaluateCurrentCandidateReadRoute(
  input: Omit<CandidateReadRouteInput, "codeCanonicalReadAllowed">,
) {
  return evaluateCandidateReadRoute({
    ...input,
    codeCanonicalReadAllowed: CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED,
  });
}
