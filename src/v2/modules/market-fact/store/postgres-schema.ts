import {
  M1_STORE_IDENTITIES,
  M1_STORE_SCHEMA_VERSION,
} from "./contracts";
import { stableContentHash } from "../../universe/stable-artifact";

export const M1_STORE_POSTGRES_SCHEMA = "market_radar_v2" as const;

const M1_STORE_POSTGRES_SCHEMA_BODY = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${M1_STORE_IDENTITIES.migration}') THEN
    CREATE ROLE ${M1_STORE_IDENTITIES.migration} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${M1_STORE_IDENTITIES.writer}') THEN
    CREATE ROLE ${M1_STORE_IDENTITIES.writer} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${M1_STORE_IDENTITIES.reader}') THEN
    CREATE ROLE ${M1_STORE_IDENTITIES.reader} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${M1_STORE_IDENTITIES.replay}') THEN
    CREATE ROLE ${M1_STORE_IDENTITIES.replay} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${M1_STORE_IDENTITIES.audit}') THEN
    CREATE ROLE ${M1_STORE_IDENTITIES.audit} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$roles$;

DO $role_guards$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    '${M1_STORE_IDENTITIES.migration}',
    '${M1_STORE_IDENTITIES.writer}',
    '${M1_STORE_IDENTITIES.reader}',
    '${M1_STORE_IDENTITIES.replay}',
    '${M1_STORE_IDENTITIES.audit}'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = role_name
        AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication)
    ) THEN
      RAISE EXCEPTION 'M1 store role % violates the NOLOGIN least-privilege contract', role_name;
    END IF;
  END LOOP;
END
$role_guards$;

CREATE SCHEMA IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA};
ALTER SCHEMA ${M1_STORE_POSTGRES_SCHEMA} OWNER TO ${M1_STORE_IDENTITIES.migration};
REVOKE ALL ON SCHEMA ${M1_STORE_POSTGRES_SCHEMA} FROM PUBLIC;
GRANT USAGE ON SCHEMA ${M1_STORE_POSTGRES_SCHEMA} TO
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_by text NOT NULL DEFAULT current_user
);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (
  artifact_name text NOT NULL CHECK (artifact_name IN (
    'EligibleInstrumentSnapshot',
    'PointInTimeMarketFact',
    'FactQualitySnapshot',
    'FeatureSetSnapshot',
    'FeatureQualitySnapshot',
    'MarketContextSnapshot'
  )),
  artifact_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  schema_version text NOT NULL,
  release_id text NOT NULL,
  source_cutoff timestamptz NOT NULL,
  generated_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  storage_digest text NOT NULL CHECK (storage_digest ~ '^sha256:[0-9a-f]{64}$'),
  retention_policy_version text NOT NULL,
  retain_until timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  writer_identity text NOT NULL DEFAULT current_user,
  PRIMARY KEY (artifact_name, artifact_id),
  CHECK (source_cutoff <= generated_at),
  CHECK (generated_at <= persisted_at),
  CHECK (persisted_at < retain_until),
  CHECK (payload->>'schemaVersion' = schema_version),
  CHECK (payload->>'releaseId' = release_id),
  CHECK ((payload->>'sourceCutoff')::timestamptz = source_cutoff),
  CHECK ((payload->>'generatedAt')::timestamptz = generated_at),
  CHECK (payload->>'contentHash' = content_hash),
  CHECK (artifact_id = COALESCE(payload->>'snapshotId', payload->>'factId'))
);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger (
  manifest_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  schema_version text NOT NULL,
  event_cutoff timestamptz NOT NULL,
  knowledge_cutoff timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  retention_policy_version text NOT NULL,
  retain_until timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  replay_identity text NOT NULL DEFAULT current_user,
  CHECK (event_cutoff <= knowledge_cutoff),
  CHECK (knowledge_cutoff <= created_at),
  CHECK (created_at <= persisted_at),
  CHECK (persisted_at < retain_until),
  CHECK (payload->>'schemaVersion' = schema_version),
  CHECK (payload->>'manifestId' = manifest_id),
  CHECK (payload->>'manifestDigest' = manifest_digest),
  CHECK ((payload->>'eventCutoff')::timestamptz = event_cutoff),
  CHECK ((payload->>'knowledgeCutoff')::timestamptz = knowledge_cutoff),
  CHECK ((payload->>'createdAt')::timestamptz = created_at)
);

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'append-only ledger rows cannot be updated or deleted'
    USING ERRCODE = '55000';
END
$function$;

DROP TRIGGER IF EXISTS reject_schema_migration_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations;
CREATE TRIGGER reject_schema_migration_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

DROP TRIGGER IF EXISTS reject_artifact_ledger_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger;
CREATE TRIGGER reject_artifact_ledger_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

DROP TRIGGER IF EXISTS reject_replay_manifest_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger;
CREATE TRIGGER reject_replay_manifest_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation() OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger OWNER TO ${M1_STORE_IDENTITIES.migration};

REVOKE ALL ON ALL TABLES IN SCHEMA ${M1_STORE_POSTGRES_SCHEMA} FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${M1_STORE_POSTGRES_SCHEMA} FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger FROM
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger FROM
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger TO
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};
GRANT INSERT (
  artifact_name,
  artifact_id,
  idempotency_key,
  schema_version,
  release_id,
  source_cutoff,
  generated_at,
  content_hash,
  storage_digest,
  retention_policy_version,
  retain_until,
  payload
) ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger TO ${M1_STORE_IDENTITIES.writer};

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger TO
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};
GRANT INSERT (
  manifest_id,
  idempotency_key,
  schema_version,
  event_cutoff,
  knowledge_cutoff,
  created_at,
  manifest_digest,
  retention_policy_version,
  retain_until,
  payload
) ON ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger TO ${M1_STORE_IDENTITIES.replay};

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations TO
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};

ALTER DEFAULT PRIVILEGES FOR ROLE ${M1_STORE_IDENTITIES.migration}
  IN SCHEMA ${M1_STORE_POSTGRES_SCHEMA} REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ${M1_STORE_IDENTITIES.migration}
  IN SCHEMA ${M1_STORE_POSTGRES_SCHEMA} REVOKE ALL ON FUNCTIONS FROM PUBLIC;
`;

export const M1_STORE_POSTGRES_MIGRATION_CHECKSUM = stableContentHash({
  schemaVersion: M1_STORE_SCHEMA_VERSION,
  sql: M1_STORE_POSTGRES_SCHEMA_BODY.trim(),
});

export const M1_STORE_POSTGRES_MIGRATION_SQL = `
${M1_STORE_POSTGRES_SCHEMA_BODY}
INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations (version, checksum)
VALUES (
  '${M1_STORE_SCHEMA_VERSION}',
  '${M1_STORE_POSTGRES_MIGRATION_CHECKSUM}'
)
ON CONFLICT (version) DO NOTHING;

DO $migration_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_STORE_SCHEMA_VERSION}'
      AND checksum = '${M1_STORE_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 store schema version exists with a different checksum';
  END IF;
END
$migration_guard$;
`;
