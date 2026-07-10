import { createHash } from "node:crypto";
import { generateUuidV7 } from "./uuid-v7";
import type {
  PostgresTransactionAdapter,
  TransactionContext,
} from "./transaction-adapter";

export type CandidateScope = "production_radar";
export type CandidateCheckpointKind = "1h" | "4h" | "24h";
export type CandidateOutcomeStatus = "recorded" | "missed" | "data_unavailable";

export type ScheduleCandidateCheckpointsCommand = {
  scope: CandidateScope;
  episodeId: string;
  sourceEventId: string;
  observedAt: string;
  releaseId: string;
  runtimeId: string;
};

export type ScheduledCandidateCheckpoint = {
  checkpointId: string;
  checkpointKind: CandidateCheckpointKind;
  created: boolean;
  dueAt: string;
  finalizeBy: string;
  idempotencyKey: string;
  windowEnd: string;
  windowStart: string;
};

export type ClaimDueCheckpointsCommand = {
  scope: CandidateScope;
  runtimeId: string;
  now: string;
  limit: number;
};

export type CandidateCheckpointClaim = {
  checkpointId: string;
  scope: CandidateScope;
  episodeId: string;
  sourceEventId: string;
  checkpointKind: CandidateCheckpointKind;
  dueAt: string;
  windowStart: string;
  windowEnd: string;
  finalizeBy: string;
  attemptCount: number;
  maxAttempts: number;
  runtimeId: string;
  claimExpiresAt: string;
  fencingToken: number;
  releaseId: string;
};

export type RetryCandidateCheckpointCommand = {
  now: string;
  errorClass: string;
  errorMessageRedacted: string;
};

export type RetryCandidateCheckpointResult = {
  checkpointId: string;
  nextAttemptAt: string;
};

export type PrevalidatedEvidenceGradeV1Outcome = {
  evidenceGradeVersion: "eg.v1";
  status: CandidateOutcomeStatus;
  contentHash: string;
  observationPrice: number | null;
  observationPriceFactId: string | null;
  windowStart: string;
  windowEnd: string;
  historicalSource: string | null;
  historicalInstrumentId: string | null;
  candleInterval: "1m" | null;
  expectedCandles: number | null;
  actualCandles: number | null;
  missingCandles: number | null;
  duplicateCandles: number | null;
  coverageRatio: number | null;
  candleSetHash: string | null;
  mfe: number | null;
  mae: number | null;
  returnAtClose: number | null;
  evidenceGrade: boolean;
  evidenceGradeReasons: string[];
  validatedAt: string;
  releaseId: string;
  runnerVersion: string;
  recordedAt: string;
};

export type RecordedCandidateOutcome = {
  outcomeId: string;
  checkpointId: string;
  status: CandidateOutcomeStatus;
  contentHash: string;
  evidenceGrade: boolean;
  evidenceGradeVersion: "eg.v1";
};

type ServiceDependencies = {
  generateId?: () => string;
};

type ScheduleProcedureRow = {
  result_checkpoint_id: string;
  created: boolean;
};

type CheckpointProcedureRow = {
  checkpoint_id: string;
  scope: string;
  episode_id: string;
  source_event_id: string;
  checkpoint_kind: string;
  due_at: Date | string;
  window_start: Date | string;
  window_end: Date | string;
  finalize_by: Date | string;
  attempt_count: number | string;
  max_attempts: number | string;
  claimed_by_runtime_id: string | null;
  claim_expires_at: Date | string | null;
  fencing_token: number | string;
  release_id: string;
};

type OutcomeProcedureRow = {
  outcome_id: string;
  checkpoint_id: string;
  status: string;
  content_hash: string;
  evidence_grade: boolean;
  evidence_grade_version: string;
};

const checkpointPolicy = [
  { checkpointKind: "1h", horizonMs: 60 * 60 * 1_000 },
  { checkpointKind: "4h", horizonMs: 4 * 60 * 60 * 1_000 },
  { checkpointKind: "24h", horizonMs: 24 * 60 * 60 * 1_000 },
] as const;
const finalizeGraceMs = 24 * 60 * 60 * 1_000;
const retryBackoffMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;
const writeTransactionOptions = {
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 2,
  statementTimeoutMs: 30_000,
} as const;

const scheduleCheckpointSql = `SELECT * FROM candidate_authority.schedule_checkpoint_v1(${placeholders(14)})`;
const claimCheckpointsSql = `SELECT * FROM candidate_authority.claim_checkpoints_v1(${placeholders(5)})`;
const retryCheckpointSql = `SELECT * FROM candidate_authority.retry_checkpoint_v1(${placeholders(11)})`;
const recordOutcomeSql = `SELECT * FROM candidate_authority.record_outcome_v1(${placeholders(32)})`;

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function commandHash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function requiredText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
  return value;
}

function timestamp(value: Date | string, label: string) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function iso(value: Date | string, label: string) {
  return new Date(timestamp(value, label)).toISOString();
}

function safeInteger(value: number | string, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`);
  return parsed;
}

function isCheckpointKind(value: string): value is CandidateCheckpointKind {
  return value === "1h" || value === "4h" || value === "24h";
}

function isOutcomeStatus(value: string): value is CandidateOutcomeStatus {
  return value === "recorded" || value === "missed" || value === "data_unavailable";
}

function firstRow<T>(rows: T[], operation: string) {
  const row = rows[0];
  if (!row) throw new Error(`${operation} returned no row`);
  return row;
}

function mapClaim(row: CheckpointProcedureRow): CandidateCheckpointClaim {
  if (row.scope !== "production_radar") throw new Error("Claim returned an unsupported scope");
  if (!isCheckpointKind(row.checkpoint_kind)) {
    throw new Error("Claim returned an unsupported checkpoint kind");
  }
  if (!row.claimed_by_runtime_id || !row.claim_expires_at) {
    throw new Error("Claim returned without a lease owner or expiry");
  }

  const claim: CandidateCheckpointClaim = {
    checkpointId: row.checkpoint_id,
    scope: row.scope,
    episodeId: row.episode_id,
    sourceEventId: row.source_event_id,
    checkpointKind: row.checkpoint_kind,
    dueAt: iso(row.due_at, "dueAt"),
    windowStart: iso(row.window_start, "windowStart"),
    windowEnd: iso(row.window_end, "windowEnd"),
    finalizeBy: iso(row.finalize_by, "finalizeBy"),
    attemptCount: safeInteger(row.attempt_count, "attemptCount"),
    maxAttempts: safeInteger(row.max_attempts, "maxAttempts"),
    runtimeId: row.claimed_by_runtime_id,
    claimExpiresAt: iso(row.claim_expires_at, "claimExpiresAt"),
    fencingToken: safeInteger(row.fencing_token, "fencingToken"),
    releaseId: row.release_id,
  };
  assertClaim(claim);
  return claim;
}

function assertClaim(claim: CandidateCheckpointClaim) {
  if (claim.scope !== "production_radar") throw new Error("Unsupported Checkpoint scope");
  requiredText(claim.checkpointId, "checkpointId");
  requiredText(claim.runtimeId, "runtimeId");
  if (!Number.isSafeInteger(claim.attemptCount) || claim.attemptCount < 1) {
    throw new Error("Checkpoint attempt count must be positive");
  }
  if (!Number.isSafeInteger(claim.fencingToken) || claim.fencingToken < 1) {
    throw new Error("Checkpoint fencing token must be positive");
  }
  timestamp(claim.dueAt, "dueAt");
  timestamp(claim.windowStart, "windowStart");
  timestamp(claim.windowEnd, "windowEnd");
  timestamp(claim.finalizeBy, "finalizeBy");
  timestamp(claim.claimExpiresAt, "claimExpiresAt");
}

function assertPrevalidatedOutcome(
  claim: CandidateCheckpointClaim,
  outcome: PrevalidatedEvidenceGradeV1Outcome,
) {
  if (outcome.evidenceGradeVersion !== "eg.v1") {
    throw new Error("Outcome must be prevalidated eg.v1 input");
  }
  if (!isOutcomeStatus(outcome.status)) throw new Error("Outcome status must be terminal");
  if (!/^sha256:[a-f0-9]{64}$/.test(outcome.contentHash)) {
    throw new Error("Outcome contentHash must be a sha256 digest");
  }
  if (iso(outcome.windowStart, "windowStart") !== iso(claim.windowStart, "claim windowStart")) {
    throw new Error("Outcome windowStart must match the claimed Checkpoint");
  }
  if (iso(outcome.windowEnd, "windowEnd") !== iso(claim.windowEnd, "claim windowEnd")) {
    throw new Error("Outcome windowEnd must match the claimed Checkpoint");
  }
  if (timestamp(outcome.validatedAt, "validatedAt") < timestamp(claim.dueAt, "dueAt")) {
    throw new Error("Outcome cannot be validated before Checkpoint dueAt");
  }
  if (timestamp(outcome.recordedAt, "recordedAt") < timestamp(claim.dueAt, "dueAt")) {
    throw new Error("Outcome cannot be recorded before Checkpoint dueAt");
  }
  if (timestamp(outcome.recordedAt, "recordedAt") > timestamp(claim.claimExpiresAt, "claimExpiresAt")) {
    throw new Error("Outcome cannot be recorded after the Checkpoint claim expires");
  }
  requiredText(outcome.releaseId, "releaseId");
  requiredText(outcome.runnerVersion, "runnerVersion");

  if (outcome.status === "recorded") {
    const requiredRecorded = [
      outcome.observationPrice,
      outcome.observationPriceFactId,
      outcome.historicalSource,
      outcome.historicalInstrumentId,
      outcome.candleInterval,
      outcome.expectedCandles,
      outcome.actualCandles,
      outcome.missingCandles,
      outcome.duplicateCandles,
      outcome.coverageRatio,
      outcome.candleSetHash,
      outcome.mfe,
      outcome.mae,
    ];
    if (requiredRecorded.some((value) => value === null)) {
      throw new Error("Recorded Outcome is missing prevalidated eg.v1 fields");
    }
  } else if (
    outcome.evidenceGrade
    || outcome.evidenceGradeReasons.length === 0
    || outcome.mfe !== null
    || outcome.mae !== null
    || outcome.returnAtClose !== null
  ) {
    throw new Error("Non-recorded Outcome must remain excluded from evidence metrics");
  }

  if (outcome.evidenceGrade !== (outcome.evidenceGradeReasons.length === 0)) {
    throw new Error("Evidence grade and reasons are inconsistent");
  }
}

async function scheduleOne(
  tx: TransactionContext,
  generateId: () => string,
  command: ScheduleCandidateCheckpointsCommand,
  observationMs: number,
  policy: (typeof checkpointPolicy)[number],
): Promise<ScheduledCandidateCheckpoint> {
  const checkpointId = generateId();
  const scheduleEventId = generateId();
  const windowStart = new Date(observationMs).toISOString();
  const dueAt = new Date(observationMs + policy.horizonMs).toISOString();
  const windowEnd = dueAt;
  const finalizeBy = new Date(observationMs + policy.horizonMs + finalizeGraceMs).toISOString();
  const idempotencyKey = [
    "checkpoint",
    "schedule",
    "v1",
    command.scope,
    command.sourceEventId,
    policy.checkpointKind,
  ].join(":");
  const hash = commandHash({
    scope: command.scope,
    episodeId: command.episodeId,
    sourceEventId: command.sourceEventId,
    checkpointKind: policy.checkpointKind,
    dueAt,
    windowStart,
    windowEnd,
    finalizeBy,
    releaseId: command.releaseId,
    runtimeId: command.runtimeId,
    idempotencyKey,
  });
  const response = await tx.query<ScheduleProcedureRow>(scheduleCheckpointSql, [
    command.scope,
    checkpointId,
    command.episodeId,
    command.sourceEventId,
    scheduleEventId,
    policy.checkpointKind,
    dueAt,
    windowStart,
    windowEnd,
    finalizeBy,
    command.releaseId,
    command.runtimeId,
    idempotencyKey,
    hash,
  ]);
  const row = firstRow(response.rows, "schedule_checkpoint_v1");

  return {
    checkpointId: row.result_checkpoint_id,
    checkpointKind: policy.checkpointKind,
    created: row.created,
    dueAt,
    finalizeBy,
    idempotencyKey,
    windowEnd,
    windowStart,
  };
}

export class CandidateCheckpointScheduler {
  private readonly generateId: () => string;

  constructor(
    private readonly transactions: PostgresTransactionAdapter,
    dependencies: ServiceDependencies = {},
  ) {
    this.generateId = dependencies.generateId ?? generateUuidV7;
  }

  async scheduleForObservation(
    command: ScheduleCandidateCheckpointsCommand,
  ): Promise<ScheduledCandidateCheckpoint[]> {
    requiredText(command.episodeId, "episodeId");
    requiredText(command.sourceEventId, "sourceEventId");
    requiredText(command.releaseId, "releaseId");
    requiredText(command.runtimeId, "runtimeId");
    const observationMs = timestamp(command.observedAt, "observedAt");

    return this.transactions.withTransaction(writeTransactionOptions, async (tx) => {
      const results: ScheduledCandidateCheckpoint[] = [];
      for (const policy of checkpointPolicy) {
        results.push(await scheduleOne(tx, this.generateId, command, observationMs, policy));
      }
      return results;
    });
  }
}

export class CandidateCheckpointExecutor {
  private readonly generateId: () => string;

  constructor(
    private readonly transactions: PostgresTransactionAdapter,
    dependencies: ServiceDependencies = {},
  ) {
    this.generateId = dependencies.generateId ?? generateUuidV7;
  }

  async claimDue(command: ClaimDueCheckpointsCommand): Promise<CandidateCheckpointClaim[]> {
    requiredText(command.runtimeId, "runtimeId");
    const now = iso(command.now, "now");
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      throw new Error("Checkpoint claim limit must be an integer between 1 and 100");
    }

    const rows = await this.transactions.withTransaction(
      writeTransactionOptions,
      async (tx) => (await tx.query<CheckpointProcedureRow>(claimCheckpointsSql, [
        command.scope,
        command.runtimeId,
        now,
        300,
        command.limit,
      ])).rows,
    );

    return rows.map((row) => {
      const claim = mapClaim(row);
      if (claim.runtimeId !== command.runtimeId) {
        throw new Error("Claim lease owner does not match the requesting runtime");
      }
      return claim;
    });
  }

  async retry(
    claim: CandidateCheckpointClaim,
    command: RetryCandidateCheckpointCommand,
  ): Promise<RetryCandidateCheckpointResult> {
    assertClaim(claim);
    const now = iso(command.now, "now");
    requiredText(command.errorClass, "errorClass");
    requiredText(command.errorMessageRedacted, "errorMessageRedacted");
    if (command.errorMessageRedacted.length > 1_000) {
      throw new Error("errorMessageRedacted exceeds 1000 characters");
    }
    const backoff = retryBackoffMs[Math.min(claim.attemptCount - 1, retryBackoffMs.length - 1)];
    const nextAttemptAt = new Date(Math.min(
      timestamp(now, "now") + backoff,
      timestamp(claim.finalizeBy, "finalizeBy"),
    )).toISOString();
    const eventId = this.generateId();
    const idempotencyKey = [
      "checkpoint",
      "retry",
      "v1",
      claim.scope,
      claim.checkpointId,
      claim.attemptCount,
      claim.fencingToken,
    ].join(":");
    const hash = commandHash({
      scope: claim.scope,
      checkpointId: claim.checkpointId,
      runtimeId: claim.runtimeId,
      fencingToken: claim.fencingToken,
      attemptCount: claim.attemptCount,
      now,
      nextAttemptAt,
      errorClass: command.errorClass,
      errorMessageRedacted: command.errorMessageRedacted,
      idempotencyKey,
    });

    await this.transactions.withTransaction(writeTransactionOptions, async (tx) => {
      await tx.query<CheckpointProcedureRow>(retryCheckpointSql, [
        claim.scope,
        claim.checkpointId,
        claim.runtimeId,
        claim.fencingToken,
        now,
        nextAttemptAt,
        command.errorClass,
        command.errorMessageRedacted,
        eventId,
        idempotencyKey,
        hash,
      ]);
    });

    return { checkpointId: claim.checkpointId, nextAttemptAt };
  }

  async recordOutcome(
    claim: CandidateCheckpointClaim,
    outcome: PrevalidatedEvidenceGradeV1Outcome,
  ): Promise<RecordedCandidateOutcome> {
    assertClaim(claim);
    assertPrevalidatedOutcome(claim, outcome);
    const outcomeId = this.generateId();
    const eventId = this.generateId();
    const idempotencyKey = [
      "checkpoint",
      "outcome",
      "v1",
      claim.scope,
      claim.checkpointId,
    ].join(":");
    const hash = commandHash({
      scope: claim.scope,
      checkpointId: claim.checkpointId,
      runtimeId: claim.runtimeId,
      fencingToken: claim.fencingToken,
      outcome,
      idempotencyKey,
    });

    const row = await this.transactions.withTransaction(writeTransactionOptions, async (tx) => {
      const response = await tx.query<OutcomeProcedureRow>(recordOutcomeSql, [
        claim.scope,
        outcomeId,
        claim.checkpointId,
        claim.runtimeId,
        claim.fencingToken,
        outcome.status,
        outcome.contentHash,
        outcome.observationPrice,
        outcome.observationPriceFactId,
        iso(outcome.windowStart, "windowStart"),
        iso(outcome.windowEnd, "windowEnd"),
        outcome.historicalSource,
        outcome.historicalInstrumentId,
        outcome.candleInterval,
        outcome.expectedCandles,
        outcome.actualCandles,
        outcome.missingCandles,
        outcome.duplicateCandles,
        outcome.coverageRatio,
        outcome.candleSetHash,
        outcome.mfe,
        outcome.mae,
        outcome.returnAtClose,
        outcome.evidenceGrade,
        outcome.evidenceGradeReasons,
        iso(outcome.validatedAt, "validatedAt"),
        outcome.releaseId,
        outcome.runnerVersion,
        iso(outcome.recordedAt, "recordedAt"),
        eventId,
        idempotencyKey,
        hash,
      ]);
      return firstRow(response.rows, "record_outcome_v1");
    });

    if (!isOutcomeStatus(row.status) || row.evidence_grade_version !== "eg.v1") {
      throw new Error("record_outcome_v1 returned an invalid Outcome contract");
    }
    return {
      outcomeId: row.outcome_id,
      checkpointId: row.checkpoint_id,
      status: row.status,
      contentHash: row.content_hash,
      evidenceGrade: row.evidence_grade,
      evidenceGradeVersion: row.evidence_grade_version,
    };
  }
}
