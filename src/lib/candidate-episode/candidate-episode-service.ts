import { createHash } from "node:crypto";
import {
  withInstrumentLock,
  type PostgresTransactionAdapter,
  type TransactionContext,
  type TransactionOptions,
} from "./transaction-adapter";
import { generateUuidV7 } from "./uuid-v7";

export type TransactionAdapter = PostgresTransactionAdapter;
export type CandidateScope = "production_radar";
export type CandidateLifecycle = "discovered" | "queued" | "validated" | "analyzed" | "closed";
export type CandidateMaturity =
  | "light_candidate"
  | "deep_candidate"
  | "evidence_observe"
  | "wait"
  | "blocked"
  | "trade_plan_ready";
export type CandidateDirectionState = "long" | "short" | "neutral" | "unknown";
export type CandidateCloseReason =
  | "expired"
  | "discovery_invalidated"
  | "structure_invalidated"
  | "direction_reversed"
  | "superseded"
  | "manual_closed"
  | "instrument_unavailable"
  | "scope_shutdown"
  | "release_retired";

export type CandidateEpisodeRow = {
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

export type CandidateEpisode = {
  episodeId: string;
  canonicalInstrumentId: string;
  venueContext: Readonly<Record<string, unknown>>;
  firstSeenAt: string;
  lastSeenAt: string;
  observationPrice: string | null;
  observationPriceFactId: string | null;
  discoveryReasons: string[];
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
};

export type OpenOrRefreshEpisodeCommand = {
  scope: CandidateScope;
  canonicalInstrumentId: string;
  venueContext: Readonly<Record<string, unknown>>;
  firstSeenAt: string;
  lastSeenAt: string;
  observationPrice: string | null;
  observationPriceFactId: string | null;
  discoveryReasons: string[];
  priorityTier: string;
  maturity: CandidateMaturity;
  directionState: CandidateDirectionState;
  expiresAt: string | null;
  releaseId: string;
  sourceScanCycleId: string;
  runtimeId: string;
  idempotencyKey: string;
};

export type CloseEpisodeCommand = {
  scope: CandidateScope;
  episodeId: string;
  canonicalInstrumentId: string;
  closedAt: string;
  closedReason: CandidateCloseReason;
  releaseId: string;
  runtimeId: string;
  idempotencyKey: string;
};

export type ReverseDirectionEpisodeCommand = {
  scope: CandidateScope;
  episodeId: string;
  canonicalInstrumentId: string;
  previousDirectionState: "long" | "short";
  closedAt: string;
  closeIdempotencyKey: string;
  replacement: OpenOrRefreshEpisodeCommand;
};

export type CandidateEpisodeLookup = {
  scope: CandidateScope;
  canonicalInstrumentId: string;
};

export type CandidateEpisodeHistoryLookup = CandidateEpisodeLookup & {
  limit?: number;
};

export type OpenOrRefreshEpisodeResult = {
  episodeId: string;
  created: boolean;
  rowVersion: number;
};

export type CloseEpisodeResult = {
  episodeId: string;
  rowVersion: number;
};

type OpenProcedureRow = {
  result_episode_id: string;
  created: boolean;
  result_row_version: number | string;
};

type CloseProcedureRow = {
  result_episode_id: string;
  result_row_version: number | string;
};

export type CandidateEpisodeServiceDependencies = {
  generateId?: () => string;
};

const WRITE_TRANSACTION: TransactionOptions = {
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 2,
  statementTimeoutMs: 30_000,
};

const READ_TRANSACTION: TransactionOptions = {
  deferrable: true,
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 2,
  readOnly: true,
  statementTimeoutMs: 30_000,
};

const OPEN_PROCEDURE_SQL = `SELECT * FROM candidate_authority.open_or_refresh_episode_v1(
  $1::text, $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::timestamptz,
  $7::timestamptz, $8::numeric, $9::text, $10::text[], $11::text, $12::text,
  $13::text, $14::timestamptz, $15::text, $16::text, $17::text, $18::text, $19::text
)`;

const CLOSE_PROCEDURE_SQL = `SELECT * FROM candidate_authority.close_episode_v1(
  $1::text, $2::uuid, $3::uuid, $4::timestamptz, $5::text,
  $6::text, $7::text, $8::text, $9::text
)`;

const ASSERT_EPISODE_DIRECTION_SQL = `SELECT candidate_authority.assert_episode_direction_v1(
  $1::text, $2::uuid, $3::text, $4::text
)`;

const EPISODE_COLUMNS = `episode_id, canonical_instrument_id, venue_context,
  first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
  discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
  expires_at, closed_at, closed_reason, parent_episode_id, release_id,
  source_scan_cycle_id, row_version`;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function commandHash(operation: string, payload: unknown) {
  const canonicalPayload = JSON.stringify(canonicalize({ operation, payload }));
  return `sha256:${createHash("sha256").update(canonicalPayload).digest("hex")}`;
}

function requiredRow<T>(rows: T[], procedure: string) {
  const row = rows[0];
  if (!row) {
    throw new Error(`${procedure} returned no result`);
  }
  return row;
}

function iso(value: Date | string | null) {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEpisode(row: CandidateEpisodeRow): CandidateEpisode {
  return {
    episodeId: row.episode_id,
    canonicalInstrumentId: row.canonical_instrument_id,
    venueContext: row.venue_context,
    firstSeenAt: iso(row.first_seen_at) as string,
    lastSeenAt: iso(row.last_seen_at) as string,
    observationPrice: row.observation_price === null ? null : String(row.observation_price),
    observationPriceFactId: row.observation_price_fact_id,
    discoveryReasons: row.discovery_reasons,
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
    rowVersion: Number(row.row_version),
  };
}

export class CandidateEpisodeService {
  private readonly generateId: () => string;

  constructor(
    private readonly transactions: TransactionAdapter,
    dependencies: CandidateEpisodeServiceDependencies = {},
  ) {
    this.generateId = dependencies.generateId ?? generateUuidV7;
  }

  async openOrRefreshEpisode(command: OpenOrRefreshEpisodeCommand) {
    const episodeId = this.generateId();
    const eventId = this.generateId();
    const hash = commandHash("open_or_refresh_episode_v1", command);

    return this.transactions.withTransaction(WRITE_TRANSACTION, (tx) =>
      withInstrumentLock(tx, command.scope, command.canonicalInstrumentId, () =>
        this.openOrRefreshWithinTransaction(tx, command, episodeId, eventId, hash)));
  }

  async closeEpisode(command: CloseEpisodeCommand) {
    const eventId = this.generateId();
    const hash = commandHash("close_episode_v1", command);

    return this.transactions.withTransaction(WRITE_TRANSACTION, (tx) =>
      withInstrumentLock(tx, command.scope, command.canonicalInstrumentId, () =>
        this.closeWithinTransaction(tx, command, eventId, hash)));
  }

  async reverseDirectionEpisode(command: ReverseDirectionEpisodeCommand) {
    const expectedDirection = command.previousDirectionState === "long" ? "short" : "long";
    if (command.replacement.directionState !== expectedDirection) {
      throw new Error("Direction reversal must be a long-short inversion");
    }
    if (
      command.replacement.scope !== command.scope
      || command.replacement.canonicalInstrumentId !== command.canonicalInstrumentId
    ) {
      throw new Error("Direction reversal child must retain scope and canonical instrument");
    }

    const closeEventId = this.generateId();
    const childEpisodeId = this.generateId();
    const childEventId = this.generateId();
    const closeCommand: CloseEpisodeCommand = {
      scope: command.scope,
      episodeId: command.episodeId,
      canonicalInstrumentId: command.canonicalInstrumentId,
      closedAt: command.closedAt,
      closedReason: "direction_reversed",
      releaseId: command.replacement.releaseId,
      runtimeId: command.replacement.runtimeId,
      idempotencyKey: command.closeIdempotencyKey,
    };
    const closeHash = commandHash("close_episode_v1", closeCommand);
    const openHash = commandHash("open_or_refresh_episode_v1", command.replacement);

    return this.transactions.withTransaction(WRITE_TRANSACTION, (tx) =>
      withInstrumentLock(tx, command.scope, command.canonicalInstrumentId, async () => {
        await tx.query(ASSERT_EPISODE_DIRECTION_SQL, [
          command.scope,
          command.episodeId,
          command.canonicalInstrumentId,
          command.previousDirectionState,
        ]);
        const closed = await this.closeWithinTransaction(tx, closeCommand, closeEventId, closeHash);
        const opened = await this.openOrRefreshWithinTransaction(
          tx,
          command.replacement,
          childEpisodeId,
          childEventId,
          openHash,
        );
        return { closed, opened };
      }));
  }

  async getActiveEpisode(lookup: CandidateEpisodeLookup) {
    return this.transactions.withTransaction(READ_TRANSACTION, async (tx) => {
      const result = await tx.query<CandidateEpisodeRow>(`SELECT ${EPISODE_COLUMNS}
        FROM candidate_authority.candidate_episodes
        WHERE scope = $1 AND canonical_instrument_id = $2 AND closed_at IS NULL
        LIMIT 1`, [lookup.scope, lookup.canonicalInstrumentId]);
      return result.rows[0] ? mapEpisode(result.rows[0]) : null;
    });
  }

  async getEpisodeHistory(lookup: CandidateEpisodeHistoryLookup) {
    const limit = lookup.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("Episode history limit must be an integer from 1 to 1000");
    }

    return this.transactions.withTransaction(READ_TRANSACTION, async (tx) => {
      const result = await tx.query<CandidateEpisodeRow>(`SELECT ${EPISODE_COLUMNS}
        FROM candidate_authority.candidate_episodes
        WHERE scope = $1 AND canonical_instrument_id = $2
        ORDER BY first_seen_at DESC, created_at DESC
        LIMIT $3`, [lookup.scope, lookup.canonicalInstrumentId, limit]);
      return result.rows.map(mapEpisode);
    });
  }

  private async openOrRefreshWithinTransaction(
    tx: TransactionContext,
    command: OpenOrRefreshEpisodeCommand,
    episodeId: string,
    eventId: string,
    hash: string,
  ): Promise<OpenOrRefreshEpisodeResult> {
    const result = await tx.query<OpenProcedureRow>(OPEN_PROCEDURE_SQL, [
      command.scope,
      episodeId,
      eventId,
      command.canonicalInstrumentId,
      command.venueContext,
      command.firstSeenAt,
      command.lastSeenAt,
      command.observationPrice,
      command.observationPriceFactId,
      command.discoveryReasons,
      command.priorityTier,
      command.maturity,
      command.directionState,
      command.expiresAt,
      command.releaseId,
      command.sourceScanCycleId,
      command.runtimeId,
      command.idempotencyKey,
      hash,
    ]);
    const row = requiredRow(result.rows, "open_or_refresh_episode_v1");
    return {
      episodeId: row.result_episode_id,
      created: row.created,
      rowVersion: Number(row.result_row_version),
    };
  }

  private async closeWithinTransaction(
    tx: TransactionContext,
    command: CloseEpisodeCommand,
    eventId: string,
    hash: string,
  ): Promise<CloseEpisodeResult> {
    const result = await tx.query<CloseProcedureRow>(CLOSE_PROCEDURE_SQL, [
      command.scope,
      command.episodeId,
      eventId,
      command.closedAt,
      command.closedReason,
      command.releaseId,
      command.runtimeId,
      command.idempotencyKey,
      hash,
    ]);
    const row = requiredRow(result.rows, "close_episode_v1");
    return {
      episodeId: row.result_episode_id,
      rowVersion: Number(row.result_row_version),
    };
  }
}
