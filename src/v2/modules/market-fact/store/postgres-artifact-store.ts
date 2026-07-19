import {
  deepFreezeArtifact,
} from "../../universe/stable-artifact";
import {
  artifactId,
  storageDigest,
  validateFactQualityLineage,
  validateM1Artifact,
} from "./artifact-integrity";
import {
  type M1AppendResult,
  type M1ArtifactByName,
  type M1ArtifactName,
  type M1SqlClient,
  type M1SqlPool,
  type M1StoredArtifactRecord,
  M1_STORE_RETENTION_POLICY_VERSION,
  M1StoreError,
} from "./contracts";
import {
  type M1ReplayManifest,
  M1_REPLAY_MANIFEST_SCHEMA_VERSION,
  validateM1ReplayManifest,
} from "./replay-manifest";
import { M1_STORE_POSTGRES_SCHEMA } from "./postgres-schema";

export type M1ArtifactAppendRequest<Name extends M1ArtifactName> = Readonly<{
  artifactName: Name;
  artifact: M1ArtifactByName[Name];
  retainUntil: string;
}>;

type AnyM1ArtifactAppendRequest = {
  [Name in M1ArtifactName]: M1ArtifactAppendRequest<Name>;
}[M1ArtifactName];

type PreparedAppend = Readonly<{
  artifactName: M1ArtifactName;
  artifact: Readonly<M1ArtifactByName[M1ArtifactName]>;
  artifactId: string;
  idempotencyKey: string;
  retainUntil: string;
  storageDigest: string;
}>;

type ArtifactLedgerRow = Record<string, unknown> & {
  artifact_name: string;
  artifact_id: string;
  idempotency_key: string;
  schema_version: string;
  release_id: string;
  source_cutoff: string | Date;
  generated_at: string | Date;
  content_hash: string;
  storage_digest: string;
  retention_policy_version: string;
  retain_until: string | Date;
  payload: unknown;
  persisted_at: string | Date;
  writer_identity: string;
};

type ReplayManifestLedgerRow = Record<string, unknown> & {
  manifest_id: string;
  idempotency_key: string;
  schema_version: string;
  event_cutoff: string | Date;
  knowledge_cutoff: string | Date;
  created_at: string | Date;
  manifest_digest: string;
  retention_policy_version: string;
  retain_until: string | Date;
  payload: unknown;
  persisted_at: string | Date;
  replay_identity: string;
};

export type M1StoredReplayManifest = Readonly<{
  manifest: M1ReplayManifest;
  idempotencyKey: string;
  retentionPolicyVersion: string;
  retainUntil: string;
  persistedAt: string;
  replayIdentity: string;
}>;

function iso(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new M1StoreError(
      "DATABASE_OPERATION_FAILED",
      "database returned a non-ISO timestamp",
    );
  }
  return parsed.toISOString();
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new M1StoreError(
      "ARTIFACT_SCHEMA_REJECTED",
      "database returned invalid JSON payload",
    );
  }
}

function sameTime(left: string, right: string | Date): boolean {
  return Date.parse(left) === Date.parse(iso(right));
}

function asArtifactRow<Name extends M1ArtifactName>(
  expectedName: Name,
  row: ArtifactLedgerRow,
): M1StoredArtifactRecord<Name> {
  if (row.artifact_name !== expectedName) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "stored artifact name does not match the requested authority",
    );
  }
  const payload = validateM1Artifact(expectedName, jsonValue(row.payload));
  const expectedId = artifactId(expectedName, payload);
  const expectedStorageDigest = storageDigest(payload);
  if (row.artifact_id !== expectedId) {
    throw new M1StoreError(
      "ARTIFACT_ID_INVALID",
      "stored artifact id does not match its payload",
    );
  }
  if (row.storage_digest !== expectedStorageDigest) {
    throw new M1StoreError(
      "ARTIFACT_STORAGE_DIGEST_MISMATCH",
      "stored artifact payload does not match its immutable storage digest",
    );
  }
  if (
    row.schema_version !== payload.schemaVersion ||
    row.release_id !== payload.releaseId ||
    row.content_hash !== payload.contentHash ||
    !sameTime(payload.sourceCutoff, row.source_cutoff) ||
    !sameTime(payload.generatedAt, row.generated_at)
  ) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "stored artifact columns do not match its canonical payload",
    );
  }
  return deepFreezeArtifact({
    artifactName: expectedName,
    artifactId: row.artifact_id,
    idempotencyKey: row.idempotency_key,
    schemaVersion: row.schema_version,
    releaseId: row.release_id,
    sourceCutoff: iso(row.source_cutoff),
    generatedAt: iso(row.generated_at),
    contentHash: row.content_hash,
    storageDigest: row.storage_digest,
    retentionPolicyVersion: row.retention_policy_version,
    retainUntil: iso(row.retain_until),
    persistedAt: iso(row.persisted_at),
    writerIdentity: row.writer_identity,
    payload,
  }) as M1StoredArtifactRecord<Name>;
}

function validateRetention(retainUntil: string, generatedAt: string): void {
  const retainMs = Date.parse(retainUntil);
  if (!Number.isFinite(retainMs) || retainMs <= Date.parse(generatedAt)) {
    throw new M1StoreError(
      "INVALID_RETENTION_BOUNDARY",
      "retainUntil must be a valid instant after artifact generation",
    );
  }
}

function validateAtomicM1Lineage(prepared: readonly PreparedAppend[]): void {
  const byName = new Map<M1ArtifactName, PreparedAppend[]>();
  for (const item of prepared) {
    byName.set(item.artifactName, [...(byName.get(item.artifactName) ?? []), item]);
  }
  const universe = byName.get("EligibleInstrumentSnapshot")?.[0]?.artifact as
    | M1ArtifactByName["EligibleInstrumentSnapshot"]
    | undefined;
  const facts = (byName.get("PointInTimeMarketFact") ?? []).map(
    (item) => item.artifact as M1ArtifactByName["PointInTimeMarketFact"],
  );
  const factQuality = byName.get("FactQualitySnapshot")?.[0]?.artifact as
    | M1ArtifactByName["FactQualitySnapshot"]
    | undefined;
  const featureSet = byName.get("FeatureSetSnapshot")?.[0]?.artifact as
    | M1ArtifactByName["FeatureSetSnapshot"]
    | undefined;
  const featureQuality = byName.get("FeatureQualitySnapshot")?.[0]?.artifact as
    | M1ArtifactByName["FeatureQualitySnapshot"]
    | undefined;
  const marketContext = byName.get("MarketContextSnapshot")?.[0]?.artifact as
    | M1ArtifactByName["MarketContextSnapshot"]
    | undefined;

  const hasFoundationArtifact =
    universe !== undefined || facts.length > 0 || factQuality !== undefined;
  if (
    hasFoundationArtifact &&
    (
      universe === undefined ||
      factQuality === undefined ||
      (universe.eligibleCount > 0 && facts.length === 0)
    )
  ) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "universe, exact fact denominator and fact quality must be appended atomically",
    );
  }

  for (const name of [
    "EligibleInstrumentSnapshot",
    "FactQualitySnapshot",
    "FeatureSetSnapshot",
    "FeatureQualitySnapshot",
    "MarketContextSnapshot",
  ] as const) {
    if ((byName.get(name)?.length ?? 0) > 1) {
      throw new M1StoreError(
        "IMMUTABLE_ID_CONFLICT",
        `an M1 atomic slice cannot contain multiple ${name} records`,
      );
    }
  }

  if (factQuality !== undefined) {
    if (universe === undefined) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "FactQualitySnapshot must be appended with its exact universe and facts",
      );
    }
    validateFactQualityLineage({ factQuality, facts });
    if (
      factQuality.universeSnapshotId !== universe.snapshotId ||
      Date.parse(universe.sourceCutoff) > Date.parse(factQuality.sourceCutoff) ||
      factQuality.releaseId !== universe.releaseId ||
      facts.some((fact) =>
        fact.sourceCutoff !== factQuality.sourceCutoff ||
        fact.releaseId !== factQuality.releaseId)
    ) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "fact quality and universe lineage do not match",
      );
    }
    const eligibleIds = universe.accounting
      .filter((record) => record.eligible)
      .map((record) => record.canonicalInstrumentId)
      .sort();
    const factIds = facts.map((fact) => fact.canonicalInstrumentId).sort();
    if (JSON.stringify(eligibleIds) !== JSON.stringify(factIds)) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "persisted fact denominator must exactly cover the eligible universe",
      );
    }
    const universeById = new Map(universe.accounting
      .filter((record) => record.eligible)
      .map((record) => [record.canonicalInstrumentId!, record]));
    if (facts.some((fact) => {
      const instrument = universeById.get(fact.canonicalInstrumentId);
      return instrument === undefined ||
        instrument.venueInstrumentId !== fact.venueInstrumentId ||
        instrument.settlementAsset !== fact.unit;
    })) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "persisted facts must exactly match universe venue identity and units",
      );
    }
  }

  if (featureSet !== undefined) {
    if (
      universe === undefined ||
      factQuality === undefined ||
      featureSet.universeSnapshotId !== universe.snapshotId ||
      featureSet.sourceCutoff !== factQuality.sourceCutoff
    ) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "FeatureSetSnapshot must be appended with its exact M1 source slice",
      );
    }
    const factIds = new Set(facts.map((fact) => fact.factId));
    if (featureSet.features.some((feature) =>
      feature.sourceFactIds.some((id) => !factIds.has(id)))) {
      throw new M1StoreError(
        "ARTIFACT_METADATA_MISMATCH",
        "feature source facts are outside the persisted fact denominator",
      );
    }
  }

  if (
    featureQuality !== undefined &&
    (featureSet === undefined ||
      featureQuality.featureSetSnapshotId !== featureSet.snapshotId)
  ) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "FeatureQualitySnapshot must reference the appended online feature set",
    );
  }
  if (
    marketContext !== undefined &&
    (universe === undefined ||
      featureSet === undefined ||
      featureQuality === undefined ||
      marketContext.universeSnapshotId !== universe.snapshotId ||
      marketContext.featureSetSnapshotId !== featureSet.snapshotId ||
      marketContext.featureQualitySnapshotId !== featureQuality.snapshotId)
  ) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "MarketContextSnapshot must reference the exact appended M1 slice",
    );
  }
}

function prepare(request: AnyM1ArtifactAppendRequest): PreparedAppend {
  const artifact = validateM1Artifact(
    request.artifactName,
    request.artifact as M1ArtifactByName[typeof request.artifactName],
  );
  validateRetention(request.retainUntil, artifact.generatedAt);
  const id = artifactId(request.artifactName, artifact);
  return {
    artifactName: request.artifactName,
    artifact: artifact as Readonly<M1ArtifactByName[M1ArtifactName]>,
    artifactId: id,
    idempotencyKey: `m1:v1:${request.artifactName}:${id}`,
    retainUntil: new Date(request.retainUntil).toISOString(),
    storageDigest: storageDigest(artifact),
  };
}

const ARTIFACT_COLUMNS = `
  artifact_name, artifact_id, idempotency_key, schema_version, release_id,
  source_cutoff, generated_at, content_hash, storage_digest,
  retention_policy_version, retain_until, payload, persisted_at, writer_identity
`;

async function appendPrepared(
  client: M1SqlClient,
  item: PreparedAppend,
): Promise<M1AppendResult> {
  const inserted = await client.query<ArtifactLedgerRow>(`
    INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (
      artifact_name, artifact_id, idempotency_key, schema_version, release_id,
      source_cutoff, generated_at, content_hash, storage_digest,
      retention_policy_version, retain_until, payload
    ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz,
      $8, $9, $10, $11::timestamptz, $12::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING ${ARTIFACT_COLUMNS}
  `, [
    item.artifactName,
    item.artifactId,
    item.idempotencyKey,
    item.artifact.schemaVersion,
    item.artifact.releaseId,
    item.artifact.sourceCutoff,
    item.artifact.generatedAt,
    item.artifact.contentHash,
    item.storageDigest,
    M1_STORE_RETENTION_POLICY_VERSION,
    item.retainUntil,
    JSON.stringify(item.artifact),
  ]);
  if (inserted.rows[0] !== undefined) {
    return {
      status: "INSERTED",
      record: asArtifactRow(item.artifactName, inserted.rows[0]),
    };
  }

  const existingByKey = await client.query<ArtifactLedgerRow>(`
    SELECT ${ARTIFACT_COLUMNS}
    FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
    WHERE idempotency_key = $1
  `, [item.idempotencyKey]);
  if (existingByKey.rows[0] !== undefined) {
    const record = asArtifactRow(item.artifactName, existingByKey.rows[0]);
    if (
      record.artifactId !== item.artifactId ||
      record.storageDigest !== item.storageDigest ||
      record.retainUntil !== item.retainUntil ||
      record.retentionPolicyVersion !== M1_STORE_RETENTION_POLICY_VERSION
    ) {
      throw new M1StoreError(
        "IDEMPOTENCY_CONFLICT",
        "idempotency key already belongs to different immutable content",
      );
    }
    return { status: "IDEMPOTENT_REPLAY", record };
  }

  const existingById = await client.query<ArtifactLedgerRow>(`
    SELECT ${ARTIFACT_COLUMNS}
    FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
    WHERE artifact_name = $1 AND artifact_id = $2
  `, [item.artifactName, item.artifactId]);
  if (existingById.rows[0] !== undefined) {
    throw new M1StoreError(
      "IMMUTABLE_ID_CONFLICT",
      "artifact identity already belongs to a different append request",
    );
  }
  throw new M1StoreError(
    "DATABASE_OPERATION_FAILED",
    "artifact insert was rejected without an observable conflict row",
  );
}

export class M1PostgresArtifactStore {
  readonly #pool: M1SqlPool;

  constructor(pool: M1SqlPool) {
    if (
      pool === null ||
      typeof pool !== "object" ||
      typeof pool.query !== "function" ||
      typeof pool.connect !== "function"
    ) {
      throw new M1StoreError(
        "DURABLE_STORE_REQUIRED",
        "M1 requires an explicitly injected PostgreSQL pool",
      );
    }
    this.#pool = pool;
  }

  async appendArtifacts(
    requests: readonly AnyM1ArtifactAppendRequest[],
  ): Promise<readonly M1AppendResult[]> {
    if (requests.length === 0) {
      return Object.freeze([]);
    }
    const prepared = requests.map(prepare);
    validateAtomicM1Lineage(prepared);
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const results: M1AppendResult[] = [];
      for (const item of prepared) {
        results.push(await appendPrepared(client, item));
      }
      await client.query("COMMIT");
      return deepFreezeArtifact(results);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original storage failure.
      }
      if (error instanceof M1StoreError) {
        throw error;
      }
      throw new M1StoreError(
        "DATABASE_OPERATION_FAILED",
        "PostgreSQL rejected the atomic M1 artifact append",
      );
    } finally {
      client.release();
    }
  }

  async readArtifact<Name extends M1ArtifactName>(
    artifactName: Name,
    requestedArtifactId: string,
  ): Promise<M1StoredArtifactRecord<Name>> {
    const result = await this.#pool.query<ArtifactLedgerRow>(`
      SELECT ${ARTIFACT_COLUMNS}
      FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
      WHERE artifact_name = $1 AND artifact_id = $2
    `, [artifactName, requestedArtifactId]);
    if (result.rows[0] === undefined) {
      throw new M1StoreError(
        "ARTIFACT_NOT_FOUND",
        `${artifactName} is not present in the durable M1 ledger`,
      );
    }
    return asArtifactRow(artifactName, result.rows[0]);
  }

  async appendReplayManifest(
    input: M1ReplayManifest,
    retainUntil: string,
  ): Promise<Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
    record: M1StoredReplayManifest;
  }>> {
    const manifest = validateM1ReplayManifest(input);
    validateRetention(retainUntil, manifest.createdAt);
    const canonicalRetainUntil = new Date(retainUntil).toISOString();
    const idempotencyKey = `m1-replay:v1:${manifest.manifestId}`;
    const result = await this.#pool.query<ReplayManifestLedgerRow>(`
      INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger (
        manifest_id, idempotency_key, schema_version, event_cutoff,
        knowledge_cutoff, created_at, manifest_digest,
        retention_policy_version, retain_until, payload
      ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz,
        $6::timestamptz, $7, $8, $9::timestamptz, $10::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [
      manifest.manifestId,
      idempotencyKey,
      M1_REPLAY_MANIFEST_SCHEMA_VERSION,
      manifest.eventCutoff,
      manifest.knowledgeCutoff,
      manifest.createdAt,
      manifest.manifestDigest,
      M1_STORE_RETENTION_POLICY_VERSION,
      canonicalRetainUntil,
      JSON.stringify(manifest),
    ]);
    if (result.rows[0] !== undefined) {
      return {
        status: "INSERTED",
        record: this.#asManifestRow(result.rows[0]),
      };
    }
    const existing = await this.#pool.query<ReplayManifestLedgerRow>(`
      SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger
      WHERE idempotency_key = $1
    `, [idempotencyKey]);
    if (existing.rows[0] === undefined) {
      throw new M1StoreError(
        "IDEMPOTENCY_CONFLICT",
        "manifest identity conflicts with a different append request",
      );
    }
    const record = this.#asManifestRow(existing.rows[0]);
    if (
      record.manifest.manifestDigest !== manifest.manifestDigest ||
      record.retainUntil !== canonicalRetainUntil ||
      record.retentionPolicyVersion !== M1_STORE_RETENTION_POLICY_VERSION
    ) {
      throw new M1StoreError(
        "IDEMPOTENCY_CONFLICT",
        "manifest idempotency key belongs to different immutable content",
      );
    }
    return { status: "IDEMPOTENT_REPLAY", record };
  }

  async readReplayManifest(manifestId: string): Promise<M1StoredReplayManifest> {
    const result = await this.#pool.query<ReplayManifestLedgerRow>(`
      SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger
      WHERE manifest_id = $1
    `, [manifestId]);
    if (result.rows[0] === undefined) {
      throw new M1StoreError(
        "ARTIFACT_NOT_FOUND",
        "replay manifest is not present in the durable M1 ledger",
      );
    }
    return this.#asManifestRow(result.rows[0]);
  }

  #asManifestRow(row: ReplayManifestLedgerRow): M1StoredReplayManifest {
    const manifest = validateM1ReplayManifest(jsonValue(row.payload));
    if (
      row.manifest_id !== manifest.manifestId ||
      row.manifest_digest !== manifest.manifestDigest ||
      row.schema_version !== manifest.schemaVersion ||
      !sameTime(manifest.eventCutoff, row.event_cutoff) ||
      !sameTime(manifest.knowledgeCutoff, row.knowledge_cutoff) ||
      !sameTime(manifest.createdAt, row.created_at)
    ) {
      throw new M1StoreError(
        "ARTIFACT_STORAGE_DIGEST_MISMATCH",
        "stored replay manifest columns do not match canonical manifest content",
      );
    }
    return deepFreezeArtifact({
      manifest,
      idempotencyKey: row.idempotency_key,
      retentionPolicyVersion: row.retention_policy_version,
      retainUntil: iso(row.retain_until),
      persistedAt: iso(row.persisted_at),
      replayIdentity: row.replay_identity,
    });
  }
}
