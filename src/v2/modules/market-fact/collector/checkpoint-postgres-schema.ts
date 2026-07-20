import { stableContentHash } from "../../universe/stable-artifact";
import {
  M1_STORE_IDENTITIES,
  M1_STORE_SCHEMA_VERSION,
} from "../store/contracts";
import { M1_STORE_POSTGRES_SCHEMA } from "../store/postgres-schema";
import { M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION } from "./checkpoint-contract";

const M1_COLLECTOR_CHECKPOINT_POSTGRES_SCHEMA_BODY = `
DO $base_migration_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_STORE_SCHEMA_VERSION}'
  ) THEN
    RAISE EXCEPTION 'M1 collector checkpoint requires the base artifact store migration';
  END IF;
END
$base_migration_guard$;

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger (
  checkpoint_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  schema_version text NOT NULL,
  release_id text NOT NULL,
  runtime_config_digest text NOT NULL CHECK (runtime_config_digest ~ '^sha256:[0-9a-f]{64}$'),
  cycle_id text NOT NULL UNIQUE,
  next_cycle_ordinal bigint NOT NULL CHECK (next_cycle_ordinal > 0),
  runtime_state text NOT NULL CHECK (runtime_state IN ('READY', 'DEGRADED', 'BACKPRESSURED')),
  universe_artifact_name text NOT NULL DEFAULT 'EligibleInstrumentSnapshot'
    CHECK (universe_artifact_name = 'EligibleInstrumentSnapshot'),
  universe_snapshot_id text NOT NULL,
  fact_quality_artifact_name text NOT NULL DEFAULT 'FactQualitySnapshot'
    CHECK (fact_quality_artifact_name = 'FactQualitySnapshot'),
  fact_quality_snapshot_id text NOT NULL,
  source_cutoff timestamptz NOT NULL,
  generated_at timestamptz NOT NULL,
  last_catalog_at timestamptz,
  next_reconciliation_at timestamptz,
  sequence_digest text NOT NULL CHECK (sequence_digest ~ '^sha256:[0-9a-f]{64}$'),
  checkpoint_digest text NOT NULL CHECK (checkpoint_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_mode text NOT NULL CHECK (authority_mode = 'NO_AUTHORITY'),
  automatic_trading_allowed boolean NOT NULL CHECK (automatic_trading_allowed = false),
  retain_until timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  writer_identity text NOT NULL DEFAULT current_user,
  UNIQUE (release_id, next_cycle_ordinal),
  FOREIGN KEY (universe_artifact_name, universe_snapshot_id)
    REFERENCES ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (artifact_name, artifact_id),
  FOREIGN KEY (fact_quality_artifact_name, fact_quality_snapshot_id)
    REFERENCES ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (artifact_name, artifact_id),
  CHECK (source_cutoff <= generated_at),
  CHECK (generated_at <= persisted_at),
  CHECK (persisted_at < retain_until),
  CHECK ((last_catalog_at IS NULL) = (next_reconciliation_at IS NULL)),
  CHECK (payload->>'schemaVersion' = schema_version),
  CHECK (payload->>'checkpointId' = checkpoint_id),
  CHECK (payload->>'checkpointDigest' = checkpoint_digest),
  CHECK (payload->>'releaseId' = release_id),
  CHECK (payload->>'runtimeConfigDigest' = runtime_config_digest),
  CHECK (payload->>'cycleId' = cycle_id),
  CHECK ((payload->>'nextCycleOrdinal')::bigint = next_cycle_ordinal),
  CHECK (payload->>'runtimeState' = runtime_state),
  CHECK (payload->>'universeSnapshotId' = universe_snapshot_id),
  CHECK (payload->>'factQualitySnapshotId' = fact_quality_snapshot_id),
  CHECK ((payload->>'sourceCutoff')::timestamptz = source_cutoff),
  CHECK ((payload->>'generatedAt')::timestamptz = generated_at),
  CHECK ((payload->>'lastCatalogAt')::timestamptz IS NOT DISTINCT FROM last_catalog_at),
  CHECK ((payload->>'nextReconciliationAt')::timestamptz IS NOT DISTINCT FROM next_reconciliation_at),
  CHECK (payload->>'sequenceDigest' = sequence_digest),
  CHECK (payload->>'authorityMode' = authority_mode),
  CHECK ((payload->>'automaticTradingAllowed')::boolean = automatic_trading_allowed),
  CHECK ((payload->>'retainUntil')::timestamptz = retain_until),
  CHECK (jsonb_typeof(payload->'sequenceState') = 'object')
);

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.validate_collector_checkpoint_references()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  universe_release text;
  universe_cutoff timestamptz;
  fact_quality_release text;
  fact_quality_cutoff timestamptz;
  fact_quality_universe_id text;
BEGIN
  SELECT release_id, source_cutoff
    INTO universe_release, universe_cutoff
  FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
  WHERE artifact_name = 'EligibleInstrumentSnapshot'
    AND artifact_id = NEW.universe_snapshot_id;

  SELECT release_id, source_cutoff, payload->>'universeSnapshotId'
    INTO fact_quality_release, fact_quality_cutoff, fact_quality_universe_id
  FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
  WHERE artifact_name = 'FactQualitySnapshot'
    AND artifact_id = NEW.fact_quality_snapshot_id;

  IF universe_release IS NULL OR fact_quality_release IS NULL THEN
    RAISE EXCEPTION 'collector checkpoint references missing artifacts';
  END IF;
  IF universe_release <> NEW.release_id
    OR fact_quality_release <> NEW.release_id
    OR fact_quality_universe_id <> NEW.universe_snapshot_id
    OR fact_quality_cutoff <> NEW.source_cutoff
    OR universe_cutoff > NEW.source_cutoff THEN
    RAISE EXCEPTION 'collector checkpoint references a mismatched durable slice';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS validate_collector_checkpoint_references
  ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger;
CREATE TRIGGER validate_collector_checkpoint_references
BEFORE INSERT ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.validate_collector_checkpoint_references();

DROP TRIGGER IF EXISTS reject_collector_checkpoint_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger;
CREATE TRIGGER reject_collector_checkpoint_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.validate_collector_checkpoint_references()
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
  OWNER TO ${M1_STORE_IDENTITIES.migration};

REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.validate_collector_checkpoint_references()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.validate_collector_checkpoint_references()
  TO ${M1_STORE_IDENTITIES.writer};
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger FROM
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger TO
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.audit};
GRANT INSERT (
  checkpoint_id,
  idempotency_key,
  schema_version,
  release_id,
  runtime_config_digest,
  cycle_id,
  next_cycle_ordinal,
  runtime_state,
  universe_artifact_name,
  universe_snapshot_id,
  fact_quality_artifact_name,
  fact_quality_snapshot_id,
  source_cutoff,
  generated_at,
  last_catalog_at,
  next_reconciliation_at,
  sequence_digest,
  checkpoint_digest,
  authority_mode,
  automatic_trading_allowed,
  retain_until,
  payload
) ON ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
TO ${M1_STORE_IDENTITIES.writer};
`;

export const M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_CHECKSUM =
  stableContentHash({
    schemaVersion: M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION,
    sql: M1_COLLECTOR_CHECKPOINT_POSTGRES_SCHEMA_BODY.trim(),
  });

export const M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL = `
${M1_COLLECTOR_CHECKPOINT_POSTGRES_SCHEMA_BODY}
INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations (version, checksum)
VALUES (
  '${M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION}',
  '${M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_CHECKSUM}'
)
ON CONFLICT (version) DO NOTHING;

DO $migration_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION}'
      AND checksum = '${M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 collector checkpoint schema version exists with a different checksum';
  END IF;
END
$migration_guard$;
`;
