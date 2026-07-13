import type { PostgresTransactionAdapter } from "./transaction-adapter";

export type CandidateOutboxStatus =
  | "pending"
  | "claimed"
  | "retry_wait"
  | "completed"
  | "quarantined";

type OutboxRow = {
  outbox_id: string;
  scope: string;
  source_type: string;
  source_id: string;
  source_version: string;
  payload_version: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  idempotency_key: string;
  status: CandidateOutboxStatus;
  attempt_count: number | string;
  max_attempts: number | string;
  next_attempt_at: Date | string | null;
  claimed_by_runtime_id: string | null;
  claim_expires_at: Date | string | null;
  fencing_token: number | string;
  error_class: string | null;
  error_message_redacted: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  quarantined_at: Date | string | null;
};

export type CandidateOutboxClaim = {
  outboxId: string;
  scope: "production_radar";
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  payloadVersion: string;
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  idempotencyKey: string;
  status: CandidateOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  runtimeId: string;
  claimExpiresAt: string;
  fencingToken: number;
  errorClass: string | null;
  errorMessageRedacted: string | null;
  createdAt: string;
  completedAt: string | null;
  quarantinedAt: string | null;
  migrationId: string;
  authorityEpoch: number;
};

export type ClaimCandidateOutboxCommand = {
  scope: "production_radar";
  runtimeId: string;
  now: string;
  limit: number;
  migrationId: string;
  authorityEpoch: number;
};

const transactionOptions = {
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 2,
  statementTimeoutMs: 30_000,
} as const;

function timestamp(value: Date | string | null, field: string) {
  if (value === null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positiveInteger(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${field} must be positive`);
  return parsed;
}

function required(value: string, field: string) {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
  return value;
}

function mapClaim(
  row: OutboxRow,
  command: Pick<ClaimCandidateOutboxCommand, "migrationId" | "authorityEpoch">,
): CandidateOutboxClaim {
  if (row.scope !== "production_radar" || row.status !== "claimed") {
    throw new Error("outbox claim returned an invalid scope or status");
  }
  if (!row.claimed_by_runtime_id || !row.claim_expires_at) {
    throw new Error("outbox claim returned without a lease");
  }
  return {
    outboxId: row.outbox_id,
    scope: row.scope,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    payloadVersion: row.payload_version,
    payload: row.payload,
    payloadHash: row.payload_hash,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attemptCount: positiveInteger(row.attempt_count, "attemptCount"),
    maxAttempts: positiveInteger(row.max_attempts, "maxAttempts"),
    nextAttemptAt: timestamp(row.next_attempt_at, "nextAttemptAt"),
    runtimeId: row.claimed_by_runtime_id,
    claimExpiresAt: timestamp(row.claim_expires_at, "claimExpiresAt")!,
    fencingToken: positiveInteger(row.fencing_token, "fencingToken"),
    errorClass: row.error_class,
    errorMessageRedacted: row.error_message_redacted,
    createdAt: timestamp(row.created_at, "createdAt")!,
    completedAt: timestamp(row.completed_at, "completedAt"),
    quarantinedAt: timestamp(row.quarantined_at, "quarantinedAt"),
    migrationId: command.migrationId,
    authorityEpoch: command.authorityEpoch,
  };
}

function assertClaim(claim: CandidateOutboxClaim) {
  required(claim.outboxId, "outboxId");
  required(claim.runtimeId, "runtimeId");
  required(claim.migrationId, "migrationId");
  if (!Number.isSafeInteger(claim.authorityEpoch) || claim.authorityEpoch < 1) {
    throw new Error("authorityEpoch must be positive");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(claim.payloadHash)) {
    throw new Error("payloadHash must be a sha256 digest");
  }
}

function assertRedactedError(errorClass: string, errorMessageRedacted: string) {
  if (!/^[a-z0-9_]{1,64}$/.test(errorClass)) {
    throw new Error("errorClass must be lower snake case");
  }
  if (
    errorMessageRedacted.length < 1
    || errorMessageRedacted.length > 256
    || /[\r\n]/.test(errorMessageRedacted)
  ) {
    throw new Error("errorMessageRedacted must be a bounded single line");
  }
}

export class CandidateOutboxService {
  constructor(private readonly transactions: PostgresTransactionAdapter) {}

  async claimDue(command: ClaimCandidateOutboxCommand) {
    required(command.runtimeId, "runtimeId");
    required(command.migrationId, "migrationId");
    timestamp(command.now, "now");
    if (!Number.isSafeInteger(command.authorityEpoch) || command.authorityEpoch < 1) {
      throw new Error("authorityEpoch must be positive");
    }
    if (!Number.isSafeInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      throw new Error("outbox claim limit must be between 1 and 100");
    }
    const rows = await this.transactions.withTransaction(transactionOptions, async (tx) => (
      await tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.claim_outbox_v1($1,$2,$3,$4,$5,$6,$7)",
        [
          command.scope,
          command.runtimeId,
          timestamp(command.now, "now"),
          300,
          command.limit,
          command.migrationId,
          command.authorityEpoch,
        ],
      )
    ).rows);
    return rows.map((row) => mapClaim(row, command));
  }

  async claimShadowCandidates(command: ClaimCandidateOutboxCommand) {
    required(command.runtimeId, "runtimeId");
    required(command.migrationId, "migrationId");
    timestamp(command.now, "now");
    if (!Number.isSafeInteger(command.authorityEpoch) || command.authorityEpoch < 1) {
      throw new Error("authorityEpoch must be positive");
    }
    if (!Number.isSafeInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      throw new Error("outbox claim limit must be between 1 and 100");
    }
    const rows = await this.transactions.withTransaction(transactionOptions, async (tx) => (
      await tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.claim_shadow_candidate_outbox_v2($1,$2,$3,$4,$5,$6,$7)",
        [
          command.scope,
          command.runtimeId,
          timestamp(command.now, "now"),
          300,
          command.limit,
          command.migrationId,
          command.authorityEpoch,
        ],
      )
    ).rows);
    return rows.map((row) => mapClaim(row, command));
  }

  async retry(
    claim: CandidateOutboxClaim,
    command: { now: string; nextAttemptAt: string },
  ) {
    assertClaim(claim);
    const response = await this.transactions.withTransaction(transactionOptions, (tx) =>
      tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.retry_outbox_v1($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          claim.scope,
          claim.outboxId,
          claim.runtimeId,
          claim.fencingToken,
          timestamp(command.now, "now"),
          timestamp(command.nextAttemptAt, "nextAttemptAt"),
          claim.migrationId,
          claim.authorityEpoch,
        ],
      ));
    const row = response.rows[0];
    if (!row || row.status !== "retry_wait") throw new Error("retry_outbox_v1 returned no retry");
    return {
      outboxId: row.outbox_id,
      status: row.status as "retry_wait",
    } as const;
  }

  async complete(claim: CandidateOutboxClaim, command: { now: string }) {
    assertClaim(claim);
    const response = await this.transactions.withTransaction(transactionOptions, (tx) =>
      tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.complete_outbox_v1($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          claim.scope,
          claim.outboxId,
          claim.runtimeId,
          claim.fencingToken,
          timestamp(command.now, "now"),
          claim.payloadHash,
          claim.migrationId,
          claim.authorityEpoch,
        ],
      ));
    const row = response.rows[0];
    if (!row || row.status !== "completed") {
      throw new Error("complete_outbox_v1 returned no completed item");
    }
    return {
      outboxId: row.outbox_id,
      status: row.status as "completed",
    } as const;
  }

  async retryOrQuarantine(
    claim: CandidateOutboxClaim,
    command: {
      now: string;
      nextAttemptAt: string;
      errorClass: string;
      errorMessageRedacted: string;
    },
  ) {
    assertClaim(claim);
    assertRedactedError(command.errorClass, command.errorMessageRedacted);
    const response = await this.transactions.withTransaction(transactionOptions, (tx) =>
      tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.retry_or_quarantine_outbox_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          claim.scope,
          claim.outboxId,
          claim.runtimeId,
          claim.fencingToken,
          timestamp(command.now, "now"),
          timestamp(command.nextAttemptAt, "nextAttemptAt"),
          command.errorClass,
          command.errorMessageRedacted,
          claim.migrationId,
          claim.authorityEpoch,
        ],
      ));
    const row = response.rows[0];
    if (!row || !["retry_wait", "quarantined"].includes(row.status)) {
      throw new Error("retry_or_quarantine_outbox_v2 returned no terminal decision");
    }
    return {
      outboxId: row.outbox_id,
      status: row.status as "retry_wait" | "quarantined",
    } as const;
  }

  async quarantine(
    claim: CandidateOutboxClaim,
    command: {
      now: string;
      errorClass: string;
      errorMessageRedacted: string;
    },
  ) {
    assertClaim(claim);
    assertRedactedError(command.errorClass, command.errorMessageRedacted);
    const response = await this.transactions.withTransaction(transactionOptions, (tx) =>
      tx.query<OutboxRow>(
        "SELECT * FROM candidate_authority.quarantine_outbox_v2($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          claim.scope,
          claim.outboxId,
          claim.runtimeId,
          claim.fencingToken,
          timestamp(command.now, "now"),
          command.errorClass,
          command.errorMessageRedacted,
          claim.migrationId,
          claim.authorityEpoch,
        ],
      ));
    const row = response.rows[0];
    if (!row || row.status !== "quarantined") {
      throw new Error("quarantine_outbox_v2 returned no quarantine");
    }
    return { outboxId: row.outbox_id, status: row.status } as const;
  }
}
