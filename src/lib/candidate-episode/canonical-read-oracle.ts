import { createHash } from "node:crypto";
import type {
  CandidateCloseReason,
  CandidateDirectionState,
  CandidateLifecycle,
  CandidateMaturity,
} from "./candidate-episode-service";
import {
  CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
  CANDIDATE_CANONICAL_REVIEW_SCHEMA_VERSION,
  CANDIDATE_CANONICAL_READ_TRANSACTION,
  CandidateCanonicalReadModel,
  compareCandidateCanonicalReferenceReads,
  type CandidateCanonicalEpisodeRead,
  type CandidateCanonicalReadCursor,
  type CandidateCanonicalReadPolicy,
  type CandidateCanonicalReadResult,
  type CandidateCanonicalReviewRead,
  type CandidateReadParity,
} from "./canonical-read-model";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";

export const CANDIDATE_CANONICAL_ORACLE_SCHEMA_VERSION = "candidate-canonical-oracle.v1" as const;
export const CANDIDATE_CANONICAL_ORACLE_PAGE_MAXIMUM = 1_000;
export const CANDIDATE_CANONICAL_ORACLE_AS_OF_MAXIMUM_AGE_SECONDS = 600;

type OracleEpisodeRow = Readonly<{
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
}>;

type OracleCheckpointRow = Readonly<{
  checkpoint_id: string;
  scope: string;
  episode_id: string;
  checkpoint_kind: "1h" | "4h" | "24h";
  due_at: Date | string;
  status: "pending" | "claimed" | "retry_wait" | "completed";
  release_id: string;
}>;

type OracleOutcomeRow = Readonly<{
  outcome_id: string;
  scope: string;
  checkpoint_id: string;
  episode_id: string;
  status: "recorded" | "missed" | "data_unavailable";
  evidence_grade: boolean;
  evidence_grade_version: string;
  mfe: number | string | null;
  mae: number | string | null;
  recorded_at: Date | string;
  release_id: string;
}>;

export type CandidateCanonicalOracleRaw = Readonly<{
  databaseNow: Date | string;
  episodes: readonly OracleEpisodeRow[];
  checkpoints: readonly OracleCheckpointRow[];
  outcomes: readonly OracleOutcomeRow[];
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function hash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function iso(value: Date | string | null) {
  if (value === null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("oracle_timestamp_invalid");
  return new Date(time).toISOString();
}

function integer(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`oracle_integer_invalid:${field}`);
  return parsed;
}

function numberOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("oracle_metric_invalid");
  const scaled = parsed * 100_000_000;
  const rounded = Math.round(scaled + Math.sign(scaled) * 1e-7) / 100_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function timestamp(value: Date | string) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("oracle_timestamp_invalid");
  return time;
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function normalizeOraclePolicy(policy: CandidateCanonicalReadPolicy | null | undefined) {
  if (!policy
      || policy.scope !== "production_radar"
      || policy.evidenceGradeVersion !== "eg.v1"
      || !["1h", "4h", "24h"].includes(policy.checkpointKind)
      || !/^[a-zA-Z0-9._:-]{1,160}$/.test(policy.releaseId)) {
    throw new Error("oracle_policy_invalid");
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
    throw new Error("oracle_policy_window_invalid");
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

function normalizeOracleCursor(cursor: CandidateCanonicalReadCursor | null | undefined) {
  if (!cursor) return null;
  if (typeof cursor.episodeId !== "string" || !/^[0-9a-f-]{36}$/.test(cursor.episodeId)) {
    throw new Error("oracle_cursor_invalid");
  }
  const firstSeenAt = iso(cursor.firstSeenAt);
  if (!firstSeenAt) throw new Error("oracle_cursor_invalid");
  return { episodeId: cursor.episodeId, firstSeenAt };
}

function unavailable(reason: "candidate_database_read_failed" | "candidate_read_input_invalid"):
CandidateCanonicalReadResult {
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

function episodeRead(row: OracleEpisodeRow): CandidateCanonicalEpisodeRead {
  const firstSeenAt = iso(row.first_seen_at);
  const lastSeenAt = iso(row.last_seen_at);
  const rowVersion = integer(row.row_version, "row_version");
  if (row.schema_version !== "candidate-episode.v1"
      || row.scope !== "production_radar"
      || !firstSeenAt
      || !lastSeenAt
      || rowVersion < 1) {
    throw new Error("oracle_episode_contract_invalid");
  }
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

function duplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function oracleReview({
  checkpoints,
  episodes,
  outcomes,
  policy,
}: {
  checkpoints: readonly OracleCheckpointRow[];
  episodes: readonly OracleEpisodeRow[];
  outcomes: readonly OracleOutcomeRow[];
  policy: CandidateCanonicalReadPolicy;
}): CandidateCanonicalReviewRead {
  const activeEpisodes = episodes.filter((episode) => episode.lifecycle !== "closed").length;
  const closedEpisodes = episodes.filter((episode) => episode.lifecycle === "closed").length;
  const pendingCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "pending").length;
  const claimedCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "claimed").length;
  const retryWaitingCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "retry_wait").length;
  const completedCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "completed").length;
  const recordedOutcomes = outcomes.filter((outcome) => outcome.status === "recorded").length;
  const missedOutcomes = outcomes.filter((outcome) => outcome.status === "missed").length;
  const dataUnavailableOutcomes = outcomes.filter((outcome) => outcome.status === "data_unavailable").length;
  const terminalOutcomes = outcomes.length;
  const evidenceOutcomes = outcomes.filter((outcome) => (
    outcome.evidence_grade && outcome.evidence_grade_version === policy.evidenceGradeVersion
  ));
  const metricOutcomes = evidenceOutcomes.filter((outcome) => outcome.mfe !== null && outcome.mae !== null);
  const mfeValues = metricOutcomes.map((outcome) => numberOrNull(outcome.mfe)).filter((value): value is number => value !== null);
  const maeValues = metricOutcomes.map((outcome) => numberOrNull(outcome.mae)).filter((value): value is number => value !== null);
  const excludedReasons: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (outcome.evidence_grade && outcome.evidence_grade_version === policy.evidenceGradeVersion) continue;
    const reason = outcome.evidence_grade_version !== policy.evidenceGradeVersion
      ? "evidence_version_mismatch"
      : outcome.status === "missed"
        ? "missed"
        : outcome.status === "data_unavailable"
          ? "data_unavailable"
          : "evidence_grade_false";
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
  }
  const completedWithoutOutcome = Math.max(0, completedCheckpoints - terminalOutcomes);
  const inProgressExclusions = Object.fromEntries(Object.entries({
    pending: pendingCheckpoints,
    claimed: claimedCheckpoints,
    pending_with_error: retryWaitingCheckpoints,
    completed_without_outcome: completedWithoutOutcome,
  }).filter(([, value]) => value > 0));
  const evidenceExclusions = Object.fromEntries(Object.entries({
    ...inProgressExclusions,
    ...excludedReasons,
  }).sort(([left], [right]) => left.localeCompare(right)));
  const dueCheckpoints = checkpoints.length;
  const average = (values: readonly number[]) => {
    if (values.length === 0) return null;
    return numberOrNull(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  return {
    schemaVersion: CANDIDATE_CANONICAL_REVIEW_SCHEMA_VERSION,
    counts: {
      activeEpisodes,
      claimedCheckpoints,
      closedEpisodes,
      completedCheckpoints,
      dataUnavailableOutcomes,
      dueCheckpoints,
      evidenceGradeOutcomes: evidenceOutcomes.length,
      metricSampleCount: metricOutcomes.length,
      missedOutcomes,
      pendingCheckpoints,
      pendingWithErrorCheckpoints: retryWaitingCheckpoints,
      recordedOutcomes,
      retryWaitingCheckpoints,
      scheduledCheckpoints: checkpoints.length,
      terminalOutcomes,
      totalEpisodes: episodes.length,
    },
    metricAverages: { mae: average(maeValues), mfe: average(mfeValues) },
    metricAdmission: {
      denominator: terminalOutcomes,
      denominatorLabel: "terminalOutcomes",
      excludedReasons: Object.fromEntries(Object.entries(excludedReasons).sort(([a], [b]) => a.localeCompare(b))),
      numerator: evidenceOutcomes.length,
      percentage: percentage(evidenceOutcomes.length, terminalOutcomes),
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
        numerator: evidenceOutcomes.length,
        denominator: dueCheckpoints,
        percentage: percentage(evidenceOutcomes.length, dueCheckpoints),
        denominatorLabel: "dueCheckpoints",
        excludedReasons: evidenceExclusions,
      },
      checkpointRecordingSuccess: {
        numerator: evidenceOutcomes.length,
        denominator: dueCheckpoints,
        percentage: percentage(evidenceOutcomes.length, dueCheckpoints),
        denominatorLabel: "dueCheckpoints",
        excludedReasons: evidenceExclusions,
      },
    },
    invariants: {
      completedCheckpointsEqualTerminalOutcomes: completedCheckpoints === terminalOutcomes,
      dueCheckpointsCoverTerminalOutcomes: dueCheckpoints >= terminalOutcomes,
      episodePartitionReconciles: episodes.length === activeEpisodes + closedEpisodes,
      metricSamplesEqualEvidenceGradeOutcomes: metricOutcomes.length === evidenceOutcomes.length,
      terminalOutcomePartitionReconciles:
        terminalOutcomes === recordedOutcomes + missedOutcomes + dataUnavailableOutcomes,
    },
  };
}

export function buildCandidateCanonicalOracleFromRaw({
  cursor,
  limit = 100,
  policy,
  raw,
}: {
  cursor?: CandidateCanonicalReadCursor | null;
  limit?: number;
  policy: CandidateCanonicalReadPolicy;
  raw: CandidateCanonicalOracleRaw;
}): CandidateCanonicalReadResult {
  let normalizedPolicy: CandidateCanonicalReadPolicy;
  let normalizedCursor: CandidateCanonicalReadCursor | null;
  try {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > CANDIDATE_CANONICAL_ORACLE_PAGE_MAXIMUM) {
      return unavailable("candidate_read_input_invalid");
    }
    normalizedPolicy = normalizeOraclePolicy(policy);
    normalizedCursor = normalizeOracleCursor(cursor);
  } catch {
    return unavailable("candidate_read_input_invalid");
  }

  try {
    const observationFrom = Date.parse(normalizedPolicy.observationCohort.from);
    const observationTo = Date.parse(normalizedPolicy.observationCohort.toExclusive);
    const dueFrom = Date.parse(normalizedPolicy.dueCohort.from);
    const dueTo = Date.parse(normalizedPolicy.dueCohort.toExclusive);
    const asOf = Date.parse(normalizedPolicy.asOf);
    const databaseNow = iso(raw.databaseNow);
    if (!databaseNow) throw new Error("oracle_database_clock_missing");
    const episodeCohort = raw.episodes.filter((episode) => {
      const firstSeen = timestamp(episode.first_seen_at);
      return episode.scope === normalizedPolicy.scope
        && episode.release_id === normalizedPolicy.releaseId
        && Number.isFinite(firstSeen)
        && firstSeen >= observationFrom
        && firstSeen < observationTo
        && firstSeen <= asOf;
    });
    const episodeIds = new Set(episodeCohort.map((episode) => episode.episode_id));
    const checkpointCohort = raw.checkpoints.filter((checkpoint) => {
      const dueAt = timestamp(checkpoint.due_at);
      return checkpoint.scope === normalizedPolicy.scope
        && checkpoint.release_id === normalizedPolicy.releaseId
        && checkpoint.checkpoint_kind === normalizedPolicy.checkpointKind
        && episodeIds.has(checkpoint.episode_id)
        && Number.isFinite(dueAt)
        && dueAt >= dueFrom
        && dueAt < dueTo
        && dueAt <= asOf;
    });
    const checkpointIds = new Set(checkpointCohort.map((checkpoint) => checkpoint.checkpoint_id));
    const checkpointById = new Map(checkpointCohort.map((checkpoint) => [
      checkpoint.checkpoint_id,
      checkpoint,
    ]));
    const outcomeCohort = raw.outcomes.filter((outcome) => {
      const recordedAt = timestamp(outcome.recorded_at);
      return outcome.scope === normalizedPolicy.scope
        && outcome.release_id === normalizedPolicy.releaseId
        && checkpointIds.has(outcome.checkpoint_id)
        && episodeIds.has(outcome.episode_id)
        && Number.isFinite(recordedAt)
        && recordedAt <= asOf;
    });
    const orderedEpisodes = episodeCohort
      .map(episodeRead)
      .sort((left, right) => right.firstSeenAt.localeCompare(left.firstSeenAt)
        || right.episodeId.localeCompare(left.episodeId));
    const afterCursor = normalizedCursor
      ? orderedEpisodes.filter((episode) => episode.firstSeenAt < normalizedCursor.firstSeenAt
        || (episode.firstSeenAt === normalizedCursor.firstSeenAt
          && episode.episodeId < normalizedCursor.episodeId))
      : orderedEpisodes;
    const hasMore = afterCursor.length > limit;
    const episodes = afterCursor.slice(0, limit);
    const last = episodes.at(-1);
    const page = {
      hasMore,
      nextCursor: hasMore && last
        ? { episodeId: last.episodeId, firstSeenAt: last.firstSeenAt }
        : null,
      returned: episodes.length,
    } as const;
    const review = oracleReview({
      checkpoints: checkpointCohort,
      episodes: episodeCohort,
      outcomes: outcomeCohort,
      policy: normalizedPolicy,
    });
    const blockers = [
      ...duplicates(episodeCohort.map((episode) => episode.episode_id))
        .map((id) => `oracle_duplicate_episode:${id}`),
      ...duplicates(checkpointCohort.map((checkpoint) => checkpoint.checkpoint_id))
        .map((id) => `oracle_duplicate_checkpoint:${id}`),
      ...duplicates(outcomeCohort.map((outcome) => outcome.checkpoint_id))
        .map((id) => `oracle_duplicate_outcome_for_checkpoint:${id}`),
      ...duplicates(episodeCohort
        .filter((episode) => episode.lifecycle !== "closed")
        .map((episode) => episode.canonical_instrument_id))
        .map((id) => `oracle_duplicate_active_instrument:${id}`),
      ...outcomeCohort
        .filter((outcome) => checkpointById.get(outcome.checkpoint_id)?.episode_id !== outcome.episode_id)
        .map((outcome) => `oracle_outcome_episode_mismatch:${outcome.outcome_id}`),
      ...outcomeCohort
        .filter((outcome) => outcome.evidence_grade && outcome.status !== "recorded")
        .map((outcome) => `oracle_evidence_grade_non_recorded:${outcome.outcome_id}`),
      ...Object.entries(review.invariants)
        .filter(([, passed]) => !passed)
        .map(([name]) => `oracle_review_invariant_failed:${name}`),
    ];
    const asOfAgeSeconds = (Date.parse(databaseNow) - asOf) / 1_000;
    if (asOfAgeSeconds < 0) blockers.push("oracle_as_of_after_database_clock");
    if (asOfAgeSeconds > CANDIDATE_CANONICAL_ORACLE_AS_OF_MAXIMUM_AGE_SECONDS) {
      blockers.push("oracle_as_of_stale_for_current_snapshot");
    }
    const contentHash = hash({ policy: normalizedPolicy, episodes, page, review });
    const common = {
      schemaVersion: CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
      authority: "candidate_authority",
      allowedUse: "candidate_lifecycle_and_review_only",
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      policy: normalizedPolicy,
      databaseNow,
      episodes,
      page,
      review,
      contentHash,
    } as const;
    return blockers.length > 0
      ? { ...common, status: "partial", blockers }
      : { ...common, status: "ready", blockers: [] };
  } catch {
    return unavailable("candidate_database_read_failed");
  }
}

async function readOracleRaw(
  tx: TransactionContext,
  policy: CandidateCanonicalReadPolicy,
): Promise<CandidateCanonicalOracleRaw> {
  const clock = await tx.query<{ database_now: Date | string }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const episodes = await tx.query<OracleEpisodeRow>(`SELECT
    schema_version, scope, episode_id, canonical_instrument_id, venue_context,
    first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
    discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
    expires_at, closed_at, closed_reason, parent_episode_id, release_id,
    source_scan_cycle_id, row_version
    FROM candidate_authority.candidate_episodes
    WHERE scope=$1 AND first_seen_at >= $2::timestamptz AND first_seen_at < $3::timestamptz`, [
    policy.scope,
    policy.observationCohort.from,
    policy.observationCohort.toExclusive,
  ]);
  const checkpoints = await tx.query<OracleCheckpointRow>(`SELECT
    checkpoint_id, scope, episode_id, checkpoint_kind, due_at, status, release_id
    FROM candidate_authority.candidate_episode_checkpoints
    WHERE scope=$1 AND due_at >= $2::timestamptz AND due_at < $3::timestamptz`, [
    policy.scope,
    policy.dueCohort.from,
    policy.dueCohort.toExclusive,
  ]);
  const outcomes = await tx.query<OracleOutcomeRow>(`SELECT
    outcome.outcome_id, outcome.scope, outcome.checkpoint_id, outcome.episode_id,
    outcome.status, outcome.evidence_grade, outcome.evidence_grade_version,
    outcome.mfe, outcome.mae, outcome.recorded_at, outcome.release_id
    FROM candidate_authority.candidate_episode_outcomes outcome
    WHERE outcome.scope=$1 AND outcome.recorded_at <= $4::timestamptz
      AND EXISTS (
        SELECT 1 FROM candidate_authority.candidate_episode_checkpoints checkpoint
        WHERE checkpoint.scope=outcome.scope AND checkpoint.checkpoint_id=outcome.checkpoint_id
          AND checkpoint.due_at >= $2::timestamptz AND checkpoint.due_at < $3::timestamptz
      )`, [
    policy.scope,
    policy.dueCohort.from,
    policy.dueCohort.toExclusive,
    policy.asOf,
  ]);
  const databaseNow = clock.rows[0]?.database_now;
  if (!databaseNow) throw new Error("oracle_database_clock_missing");
  return {
    databaseNow,
    episodes: episodes.rows,
    checkpoints: checkpoints.rows,
    outcomes: outcomes.rows,
  };
}

export type CandidateCanonicalOracleComparison = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_ORACLE_SCHEMA_VERSION;
  status: "pass" | "fail" | "unavailable";
  sameDatabaseSnapshot: true;
  transactionIsolation: "serializable_read_only_deferrable";
  candidate: CandidateCanonicalReadResult | null;
  reference: CandidateCanonicalReadResult | null;
  parity: CandidateReadParity | null;
  canAuthorizeCutover: false;
  automaticPhaseAdvance: false;
  blockers: readonly string[];
}>;

export class CandidateCanonicalReadOracleCoordinator {
  private readonly candidate: CandidateCanonicalReadModel;

  constructor(private readonly transactions: PostgresTransactionAdapter) {
    this.candidate = new CandidateCanonicalReadModel(transactions);
  }

  async compare(input: {
    cursor?: CandidateCanonicalReadCursor | null;
    limit?: number;
    policy: CandidateCanonicalReadPolicy;
    signal?: AbortSignal;
  }): Promise<CandidateCanonicalOracleComparison> {
    let policy: CandidateCanonicalReadPolicy;
    try {
      policy = normalizeOraclePolicy(input.policy);
    } catch {
      return {
        schemaVersion: CANDIDATE_CANONICAL_ORACLE_SCHEMA_VERSION,
        status: "unavailable",
        sameDatabaseSnapshot: true,
        transactionIsolation: "serializable_read_only_deferrable",
        candidate: null,
        reference: null,
        parity: null,
        canAuthorizeCutover: false,
        automaticPhaseAdvance: false,
        blockers: ["oracle_input_invalid"],
      };
    }
    try {
      return await this.transactions.withTransaction(
        input.signal
          ? { ...CANDIDATE_CANONICAL_READ_TRANSACTION, signal: input.signal }
          : CANDIDATE_CANONICAL_READ_TRANSACTION,
        async (tx) => {
          const candidate = await this.candidate.readInTransaction(tx, input);
          const raw = await readOracleRaw(tx, policy);
          const reference = buildCandidateCanonicalOracleFromRaw({ ...input, raw });
          const parity = compareCandidateCanonicalReferenceReads(reference, candidate);
          return {
            schemaVersion: CANDIDATE_CANONICAL_ORACLE_SCHEMA_VERSION,
            status: parity.status,
            sameDatabaseSnapshot: true,
            transactionIsolation: "serializable_read_only_deferrable",
            candidate,
            reference,
            parity,
            canAuthorizeCutover: false,
            automaticPhaseAdvance: false,
            blockers: parity.status === "pass" ? [] : ["candidate_reference_parity_not_pass"],
          };
        },
      );
    } catch {
      return {
        schemaVersion: CANDIDATE_CANONICAL_ORACLE_SCHEMA_VERSION,
        status: "unavailable",
        sameDatabaseSnapshot: true,
        transactionIsolation: "serializable_read_only_deferrable",
        candidate: null,
        reference: null,
        parity: null,
        canAuthorizeCutover: false,
        automaticPhaseAdvance: false,
        blockers: ["oracle_database_read_failed"],
      };
    }
  }
}
