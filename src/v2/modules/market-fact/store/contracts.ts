import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  MarketContextSnapshot,
  PointInTimeMarketFact,
} from "../../../domain/contracts";

export const M1_STORE_SCHEMA_VERSION = "v2-m1-artifact-store.v1" as const;
export const M1_STORE_RETENTION_POLICY_VERSION =
  "v2-m1-rehearsal-retention.v1" as const;

export const M1_ARTIFACT_NAMES = [
  "EligibleInstrumentSnapshot",
  "PointInTimeMarketFact",
  "FactQualitySnapshot",
  "FeatureSetSnapshot",
  "FeatureQualitySnapshot",
  "MarketContextSnapshot",
] as const;

export type M1ArtifactName = (typeof M1_ARTIFACT_NAMES)[number];

export type M1ArtifactByName = {
  EligibleInstrumentSnapshot: EligibleInstrumentSnapshot;
  PointInTimeMarketFact: PointInTimeMarketFact;
  FactQualitySnapshot: FactQualitySnapshot;
  FeatureSetSnapshot: FeatureSetSnapshot;
  FeatureQualitySnapshot: FeatureQualitySnapshot;
  MarketContextSnapshot: MarketContextSnapshot;
};

export const M1_STORE_IDENTITIES = Object.freeze({
  migration: "market_radar_v2_m1_migration",
  writer: "market_radar_v2_m1_writer",
  reader: "market_radar_v2_m1_reader",
  replay: "market_radar_v2_m1_replay",
  audit: "market_radar_v2_m1_audit",
} as const);

export const M1_STORE_IDENTITY_CAPABILITIES = Object.freeze({
  migration: Object.freeze([
    "schema_ownership",
    "ddl",
    "append_only_trigger_ownership",
  ]),
  writer: Object.freeze([
    "artifact_insert",
    "artifact_idempotency_read",
  ]),
  reader: Object.freeze([
    "artifact_read",
    "manifest_read",
    "schema_version_read",
  ]),
  replay: Object.freeze([
    "artifact_read",
    "manifest_insert",
    "manifest_idempotency_read",
    "schema_version_read",
  ]),
  audit: Object.freeze([
    "artifact_read",
    "manifest_read",
    "schema_version_read",
  ]),
} as const);

export type M1StoreErrorCode =
  | "DURABLE_STORE_REQUIRED"
  | "ARTIFACT_SCHEMA_REJECTED"
  | "ARTIFACT_CONTENT_HASH_INVALID"
  | "ARTIFACT_ID_INVALID"
  | "ARTIFACT_STORAGE_DIGEST_MISMATCH"
  | "ARTIFACT_METADATA_MISMATCH"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_RETIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "IMMUTABLE_ID_CONFLICT"
  | "INVALID_RETENTION_BOUNDARY"
  | "REPLAY_MANIFEST_REJECTED"
  | "REPLAY_CUTOFF_VIOLATION"
  | "REPLAY_SOURCE_MISMATCH"
  | "REPLAY_PARITY_FAILED"
  | "DATABASE_OPERATION_FAILED";

export class M1StoreError extends Error {
  readonly code: M1StoreErrorCode;

  constructor(code: M1StoreErrorCode, message: string) {
    super(message);
    this.name = "M1StoreError";
    this.code = code;
  }
}

export type M1StoredArtifactRecord<Name extends M1ArtifactName = M1ArtifactName> =
  Readonly<{
    artifactName: Name;
    artifactId: string;
    idempotencyKey: string;
    schemaVersion: string;
    releaseId: string;
    sourceCutoff: string;
    generatedAt: string;
    contentHash: string;
    storageDigest: string;
    retentionPolicyVersion: string;
    retainUntil: string;
    persistedAt: string;
    writerIdentity: string;
    payload: Readonly<M1ArtifactByName[Name]>;
  }>;

export type M1AppendResult<Name extends M1ArtifactName = M1ArtifactName> =
  Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
    record: M1StoredArtifactRecord<Name>;
  }>;

export type M1SqlQueryResult<Row extends Record<string, unknown>> = Readonly<{
  rows: readonly Row[];
  rowCount: number | null;
}>;

export type M1SqlClient = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<M1SqlQueryResult<Row>>;
};

export type M1SqlTransactionClient = M1SqlClient & {
  release(): void;
};

export type M1SqlPool = M1SqlClient & {
  connect(): Promise<M1SqlTransactionClient>;
};
