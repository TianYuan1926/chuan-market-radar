import { createHash } from "node:crypto";
import type {
  MarketRadarSnapshot,
  ScanArchiveSummary,
  ScanReplayFrame,
} from "../market/types";
import {
  scanArchiveToRecord,
  type PersistedScanArchiveRecord,
} from "../persistence/persistence-contract";
import type { CandidateDirectionState, CandidateMaturity } from "./candidate-episode-service";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";
import { generateUuidV7 } from "./uuid-v7";

export const SHADOW_CANDIDATE_SOURCE_TYPE = "legacy_scan_candidate" as const;
export const SHADOW_CANDIDATE_PAYLOAD_VERSION = "shadow-candidate-observation.v1" as const;
export const SHADOW_VENUE_CONTEXT_VERSION = "shadow-venue-context.v1" as const;

const allowedMaturities = new Set<CandidateMaturity>([
  "light_candidate",
  "deep_candidate",
]);
const allowedDirections = new Set<CandidateDirectionState>([
  "neutral",
  "unknown",
]);
const allowedPriorityTiers = new Set(["A", "B", "C"]);

export type ShadowCandidateObservationV1 = Readonly<{
  schemaVersion: typeof SHADOW_CANDIDATE_PAYLOAD_VERSION;
  canonicalInstrumentId: string;
  venueContext: ShadowVenueContextV1;
  firstSeenAt: string;
  lastSeenAt: string;
  observationPrice: string | null;
  observationPriceFactId: string | null;
  discoveryReasons: readonly string[];
  priorityTier: "A" | "B" | "C";
  maturity: "light_candidate" | "deep_candidate";
  directionState: "neutral" | "unknown";
  expiresAt: string | null;
  releaseId: string;
  sourceScanCycleId: string;
}>;

export type ShadowVenueContextV1 = Readonly<{
  schemaVersion: typeof SHADOW_VENUE_CONTEXT_VERSION;
  venue: "BINANCE" | "OKX" | "BYBIT" | "COINGLASS";
  venueInstrumentId: string;
  contractType: "perpetual";
  settlementAsset: string;
  resolutionStatus: "resolved";
  identityEvidenceIds: readonly string[];
}>;

export type PersistScanArchiveWithCandidateOutboxCommand = Readonly<{
  legacyScope: string;
  candidateScope: "production_radar";
  migrationId: string;
  authorityEpoch: number;
  summary: ScanArchiveSummary;
  replayFrame: ScanReplayFrame;
  snapshot?: MarketRadarSnapshot;
  candidates: readonly ShadowCandidateObservationV1[];
}>;

type SourceWriterDependencies = Readonly<{
  generateId?: () => string;
}>;

type EnqueueRow = {
  outbox_id: string;
  payload_hash: string;
  status: string;
};

const writeOptions = {
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 2,
  statementTimeoutMs: 30_000,
} as const;

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("shadow_payload_rejects_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("shadow_payload_rejects_unsupported_value");
}

export function hashShadowCandidatePayload(payload: ShadowCandidateObservationV1) {
  return `sha256:${createHash("sha256").update(canonicalize(payload)).digest("hex")}`;
}

function nonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field}_must_be_non_empty`);
  }
}

function isoTime(value: unknown, field: string) {
  nonEmpty(value, field);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field}_must_be_canonical_iso_time`);
  }
  return parsed;
}

function plainRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validateVenueContext(value: unknown): asserts value is ShadowVenueContextV1 {
  if (!plainRecord(value)) throw new Error("venue_context_must_be_object");
  const context = value as Record<string, unknown>;
  if (!exactKeys(context, [
    "contractType",
    "identityEvidenceIds",
    "resolutionStatus",
    "schemaVersion",
    "settlementAsset",
    "venue",
    "venueInstrumentId",
  ])) {
    throw new Error("venue_context_keys_invalid");
  }
  if (context.schemaVersion !== SHADOW_VENUE_CONTEXT_VERSION
      || !["BINANCE", "OKX", "BYBIT", "COINGLASS"].includes(String(context.venue))
      || context.contractType !== "perpetual"
      || context.resolutionStatus !== "resolved") {
    throw new Error("venue_context_identity_unresolved");
  }
  nonEmpty(context.venueInstrumentId, "venueInstrumentId");
  nonEmpty(context.settlementAsset, "settlementAsset");
  if (!Array.isArray(context.identityEvidenceIds)
      || context.identityEvidenceIds.length === 0
      || context.identityEvidenceIds.length > 20
      || context.identityEvidenceIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("identity_evidence_ids_invalid");
  }
}

export function validateShadowCandidateObservation(
  value: unknown,
): asserts value is ShadowCandidateObservationV1 {
  if (!plainRecord(value)) throw new Error("shadow_candidate_payload_must_be_object");
  const payload = value as Record<string, unknown>;
  const expectedKeys = [
    "canonicalInstrumentId",
    "directionState",
    "discoveryReasons",
    "expiresAt",
    "firstSeenAt",
    "lastSeenAt",
    "maturity",
    "observationPrice",
    "observationPriceFactId",
    "priorityTier",
    "releaseId",
    "schemaVersion",
    "sourceScanCycleId",
    "venueContext",
  ];
  if (!exactKeys(payload, expectedKeys)) {
    throw new Error("shadow_candidate_payload_keys_invalid");
  }
  if (payload.schemaVersion !== SHADOW_CANDIDATE_PAYLOAD_VERSION) {
    throw new Error("shadow_candidate_payload_version_unsupported");
  }
  for (const field of ["canonicalInstrumentId", "releaseId", "sourceScanCycleId"] as const) {
    nonEmpty(payload[field], field);
  }
  validateVenueContext(payload.venueContext);
  const firstSeen = isoTime(payload.firstSeenAt, "firstSeenAt");
  const lastSeen = isoTime(payload.lastSeenAt, "lastSeenAt");
  if (lastSeen < firstSeen) throw new Error("last_seen_before_first_seen");
  if (payload.expiresAt !== null && isoTime(payload.expiresAt, "expiresAt") < firstSeen) {
    throw new Error("expires_before_first_seen");
  }
  const price = payload.observationPrice;
  const priceFact = payload.observationPriceFactId;
  if ((price === null) !== (priceFact === null)) {
    throw new Error("observation_price_fact_pair_required");
  }
  if (price !== null) {
    nonEmpty(price, "observationPrice");
    nonEmpty(priceFact, "observationPriceFactId");
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      throw new Error("observation_price_must_be_positive");
    }
  }
  if (!Array.isArray(payload.discoveryReasons)
      || payload.discoveryReasons.length === 0
      || payload.discoveryReasons.length > 20
      || payload.discoveryReasons.some((reason) => (
        typeof reason !== "string" || !/^[a-z0-9_:-]{1,96}$/.test(reason)
      ))) {
    throw new Error("discovery_reasons_required");
  }
  if (!allowedPriorityTiers.has(String(payload.priorityTier))) {
    throw new Error("priority_tier_invalid");
  }
  if (!allowedMaturities.has(payload.maturity as CandidateMaturity)) {
    throw new Error("shadow_maturity_not_candidate_only");
  }
  if (!allowedDirections.has(payload.directionState as CandidateDirectionState)) {
    throw new Error("direction_state_invalid");
  }
  if (Buffer.byteLength(canonicalize(payload), "utf8") > 16_384) {
    throw new Error("shadow_candidate_payload_too_large");
  }
}

function validateCommand(command: PersistScanArchiveWithCandidateOutboxCommand) {
  nonEmpty(command.legacyScope, "legacyScope");
  nonEmpty(command.migrationId, "migrationId");
  if (command.candidateScope !== "production_radar") throw new Error("candidate_scope_invalid");
  if (!Number.isSafeInteger(command.authorityEpoch) || command.authorityEpoch < 1) {
    throw new Error("authority_epoch_must_be_positive");
  }
  if (command.summary.id !== command.replayFrame.id
      || command.summary.generatedAt !== command.replayFrame.generatedAt) {
    throw new Error("scan_archive_identity_mismatch");
  }
  const identities = new Set<string>();
  for (const candidate of command.candidates) {
    validateShadowCandidateObservation(candidate);
    if (candidate.sourceScanCycleId !== command.summary.id) {
      throw new Error("candidate_scan_cycle_mismatch");
    }
    if (identities.has(candidate.canonicalInstrumentId)) {
      throw new Error("duplicate_candidate_identity");
    }
    identities.add(candidate.canonicalInstrumentId);
  }
}

async function persistImmutableScanArchive(
  tx: TransactionContext,
  record: PersistedScanArchiveRecord,
) {
  const inserted = await tx.query<{ inserted: boolean }>(`
    WITH inserted AS (
      INSERT INTO scan_archives (
        id, scope, source, status, generated_at, scanned_count, anomaly_count,
        candidate_count, signals_count, top_symbols, payload
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (scope, id) DO NOTHING
      RETURNING true AS inserted
    )
    SELECT COALESCE((SELECT inserted FROM inserted), false) AS inserted
  `, [
    record.id,
    record.scope,
    record.source,
    record.status,
    record.generated_at,
    record.scanned_count,
    record.anomaly_count,
    record.candidate_count,
    record.signals_count,
    record.top_symbols,
    record.payload,
  ]);
  if (inserted.rows[0]?.inserted) return true;

  const existing = await tx.query<{ exact_match: boolean }>(`
    SELECT source = $3
      AND status = $4
      AND generated_at = $5::timestamptz
      AND scanned_count = $6
      AND anomaly_count = $7
      AND candidate_count = $8
      AND signals_count = $9
      AND top_symbols = $10::text[]
      AND payload = $11::jsonb AS exact_match
    FROM scan_archives
    WHERE scope = $2 AND id = $1
  `, [
    record.id,
    record.scope,
    record.source,
    record.status,
    record.generated_at,
    record.scanned_count,
    record.anomaly_count,
    record.candidate_count,
    record.signals_count,
    record.top_symbols,
    record.payload,
  ]);
  if (existing.rows[0]?.exact_match !== true) {
    throw new Error("scan_archive_idempotency_content_conflict");
  }
  return false;
}

export class CandidateShadowCaptureSourceWriter {
  private readonly generateId: () => string;

  constructor(
    private readonly transactions: PostgresTransactionAdapter,
    dependencies: SourceWriterDependencies = {},
  ) {
    this.generateId = dependencies.generateId ?? generateUuidV7;
  }

  async persist(command: PersistScanArchiveWithCandidateOutboxCommand) {
    validateCommand(command);
    const archive = scanArchiveToRecord(
      command.summary,
      command.replayFrame,
      command.legacyScope,
      command.snapshot,
    );
    const prepared = command.candidates.map((payload) => ({
      outboxId: this.generateId(),
      payload,
      payloadHash: hashShadowCandidatePayload(payload),
      sourceId: `${command.summary.id}:${payload.canonicalInstrumentId}`,
      sourceVersion: command.summary.generatedAt,
      idempotencyKey: `shadow-capture:${command.summary.id}:${payload.canonicalInstrumentId}`,
    }));

    return this.transactions.withTransaction(writeOptions, async (tx) => {
      const sourceInserted = await persistImmutableScanArchive(tx, archive);
      const outbox = [];
      for (const item of prepared) {
        const result = await tx.query<EnqueueRow>(`
          SELECT outbox_id, payload_hash, status
          FROM candidate_authority.enqueue_shadow_candidate_outbox_v2(
            $1::text,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text,$7::text,$8::text,$9::bigint
          )
        `, [
          command.candidateScope,
          item.outboxId,
          item.sourceId,
          item.sourceVersion,
          item.payload,
          item.payloadHash,
          item.idempotencyKey,
          command.migrationId,
          command.authorityEpoch,
        ]);
        const row = result.rows[0];
        if (!row || row.payload_hash !== item.payloadHash) {
          throw new Error("shadow_candidate_enqueue_result_invalid");
        }
        outbox.push({
          outboxId: row.outbox_id,
          payloadHash: row.payload_hash,
          status: row.status,
        });
      }
      return { sourceInserted, outbox };
    });
  }
}
