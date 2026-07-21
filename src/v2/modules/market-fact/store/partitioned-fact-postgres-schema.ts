import { stableContentHash } from "../../universe/stable-artifact";
import {
  M1_STORE_IDENTITIES,
  M1_STORE_SCHEMA_VERSION,
} from "./contracts";
import {
  M1_FACT_DAILY_PARTITION_POLICY_VERSION,
  M1_FACT_RETENTION_IDENTITY,
  M1_PARTITIONED_FACT_SCHEMA_VERSION,
} from "./partitioned-fact-contract";
import {
  M1_STORE_POSTGRES_MIGRATION_CHECKSUM,
  M1_STORE_POSTGRES_SCHEMA,
} from "./postgres-schema";

export const M1_PARTITIONED_FACT_IDENTITY_TABLE =
  "point_in_time_market_fact_active_identity_registry" as const;
export const M1_PARTITIONED_FACT_TABLE =
  "point_in_time_market_fact_ledger" as const;
export const M1_FACT_PARTITION_EVENT_TABLE =
  "market_fact_partition_event_ledger" as const;
export const M1_FACT_BACKUP_EVIDENCE_TABLE =
  "market_fact_backup_evidence_ledger" as const;
export const M1_FACT_RETENTION_RUN_TABLE =
  "market_fact_retention_run_ledger" as const;

const M1_PARTITIONED_FACT_POSTGRES_SCHEMA_BODY = `
DO $base_migration_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_STORE_SCHEMA_VERSION}'
      AND checksum = '${M1_STORE_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 partitioned fact storage requires the exact base store migration';
  END IF;
END
$base_migration_guard$;

DO $retention_role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = '${M1_FACT_RETENTION_IDENTITY}'
  ) THEN
    CREATE ROLE ${M1_FACT_RETENTION_IDENTITY}
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = '${M1_FACT_RETENTION_IDENTITY}'
      AND (
        rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR
        rolinherit OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'M1 fact retention role violates the NOLOGIN least-privilege contract';
  END IF;
END
$retention_role$;

GRANT USAGE ON SCHEMA ${M1_STORE_POSTGRES_SCHEMA}
  TO ${M1_FACT_RETENTION_IDENTITY};

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE} (
  fact_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  source_cutoff timestamptz NOT NULL,
  storage_digest text NOT NULL CHECK (storage_digest ~ '^sha256:[0-9a-f]{64}$'),
  retention_policy_version text NOT NULL,
  retain_until timestamptz NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  writer_identity text NOT NULL DEFAULT current_user,
  UNIQUE (
    fact_id,
    idempotency_key,
    source_cutoff,
    storage_digest,
    retention_policy_version,
    retain_until
  ),
  CHECK (registered_at < retain_until)
);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} (
  artifact_name text NOT NULL DEFAULT 'PointInTimeMarketFact'
    CHECK (artifact_name = 'PointInTimeMarketFact'),
  artifact_id text NOT NULL,
  idempotency_key text NOT NULL,
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
  PRIMARY KEY (source_cutoff, artifact_id),
  UNIQUE (source_cutoff, idempotency_key),
  FOREIGN KEY (
    artifact_id,
    idempotency_key,
    source_cutoff,
    storage_digest,
    retention_policy_version,
    retain_until
  ) REFERENCES ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE} (
    fact_id,
    idempotency_key,
    source_cutoff,
    storage_digest,
    retention_policy_version,
    retain_until
  ),
  CHECK (source_cutoff <= generated_at),
  CHECK (generated_at <= persisted_at),
  CHECK (persisted_at < retain_until),
  CHECK (payload->>'schemaVersion' = schema_version),
  CHECK (payload->>'releaseId' = release_id),
  CHECK ((payload->>'sourceCutoff')::timestamptz = source_cutoff),
  CHECK ((payload->>'generatedAt')::timestamptz = generated_at),
  CHECK (payload->>'contentHash' = content_hash),
  CHECK (artifact_id = payload->>'factId')
) PARTITION BY RANGE (source_cutoff);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} (
  event_id text PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('CREATED', 'DROPPED')),
  partition_name text NOT NULL CHECK (
    partition_name ~ '^point_in_time_market_fact_ledger_p[0-9]{8}$'
  ),
  lower_bound timestamptz NOT NULL,
  upper_bound timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  release_id text NOT NULL,
  partition_policy_version text NOT NULL
    CHECK (partition_policy_version = '${M1_FACT_DAILY_PARTITION_POLICY_VERSION}'),
  retention_run_id text,
  operator_identity text NOT NULL
    CHECK (operator_identity = '${M1_FACT_RETENTION_IDENTITY}'),
  session_identity text NOT NULL DEFAULT session_user,
  UNIQUE (partition_name, event_type),
  CHECK (lower_bound < upper_bound),
  CHECK ((event_type = 'CREATED' AND retention_run_id IS NULL) OR
    (event_type = 'DROPPED' AND retention_run_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE} (
  evidence_id text PRIMARY KEY,
  release_id text NOT NULL,
  backup_created_at timestamptz NOT NULL,
  restore_verified_at timestamptz NOT NULL,
  covered_through timestamptz NOT NULL,
  artifact_count bigint NOT NULL CHECK (artifact_count >= 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^sha256:[0-9a-f]{64}$'),
  target_identity text NOT NULL,
  auditor_identity text NOT NULL DEFAULT current_user,
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (covered_through <= backup_created_at),
  CHECK (backup_created_at <= restore_verified_at),
  CHECK (restore_verified_at <= persisted_at)
);

CREATE TABLE IF NOT EXISTS ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} (
  run_id text PRIMARY KEY,
  release_id text NOT NULL,
  cutoff_day date NOT NULL,
  backup_evidence_id text NOT NULL REFERENCES
    ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE} (evidence_id),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dropped_partition_count integer NOT NULL CHECK (dropped_partition_count >= 0),
  dropped_fact_count bigint NOT NULL CHECK (dropped_fact_count >= 0),
  dropped_total_bytes bigint NOT NULL CHECK (dropped_total_bytes >= 0),
  retention_identity text NOT NULL
    CHECK (retention_identity = '${M1_FACT_RETENTION_IDENTITY}'),
  session_identity text NOT NULL DEFAULT session_user
);

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.register_point_in_time_market_fact_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  existing ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger AS legacy
    WHERE legacy.idempotency_key = NEW.idempotency_key
      OR (
        legacy.artifact_name = 'PointInTimeMarketFact'
        AND legacy.artifact_id = NEW.artifact_id
      )
  ) THEN
    RAISE EXCEPTION 'partitioned_fact_legacy_identity_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS event
    WHERE event.event_type = 'DROPPED'
      AND event.lower_bound <= NEW.source_cutoff
      AND NEW.source_cutoff < event.upper_bound
  ) THEN
    RAISE EXCEPTION 'partitioned_fact_identity_retired'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE} (
    fact_id,
    idempotency_key,
    source_cutoff,
    storage_digest,
    retention_policy_version,
    retain_until,
    writer_identity
  ) VALUES (
    NEW.artifact_id,
    NEW.idempotency_key,
    NEW.source_cutoff,
    NEW.storage_digest,
    NEW.retention_policy_version,
    NEW.retain_until,
    NEW.writer_identity
  )
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO existing
  FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}
  WHERE fact_id = NEW.artifact_id OR idempotency_key = NEW.idempotency_key;

  IF existing.fact_id IS NULL THEN
    RAISE EXCEPTION 'partitioned_fact_identity_conflict'
      USING ERRCODE = '23505';
  END IF;
  IF existing.idempotency_key = NEW.idempotency_key AND (
    existing.fact_id <> NEW.artifact_id OR
    existing.source_cutoff <> NEW.source_cutoff OR
    existing.storage_digest <> NEW.storage_digest OR
    existing.retention_policy_version <> NEW.retention_policy_version OR
    existing.retain_until <> NEW.retain_until
  ) THEN
    RAISE EXCEPTION 'partitioned_fact_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;
  IF existing.fact_id <> NEW.artifact_id OR
    existing.idempotency_key <> NEW.idempotency_key OR
    existing.source_cutoff <> NEW.source_cutoff OR
    existing.storage_digest <> NEW.storage_digest OR
    existing.retention_policy_version <> NEW.retention_policy_version OR
    existing.retain_until <> NEW.retain_until THEN
    RAISE EXCEPTION 'partitioned_fact_immutable_id_conflict'
      USING ERRCODE = '23505';
  END IF;
  IF existing.retain_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'partitioned_fact_identity_retired'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_unpartitioned_market_fact_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.artifact_name <> 'PointInTimeMarketFact' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger AS existing
    WHERE existing.artifact_name = NEW.artifact_name
      AND existing.artifact_id = NEW.artifact_id
      AND existing.idempotency_key = NEW.idempotency_key
      AND existing.source_cutoff = NEW.source_cutoff
      AND existing.storage_digest = NEW.storage_digest
      AND existing.retention_policy_version = NEW.retention_policy_version
      AND existing.retain_until = NEW.retain_until
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'unpartitioned_market_fact_write_forbidden'
    USING ERRCODE = '55000';
END
$function$;

DROP TRIGGER IF EXISTS reject_unpartitioned_market_fact_insert
  ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger;
CREATE TRIGGER reject_unpartitioned_market_fact_insert
BEFORE INSERT ON ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
FOR EACH ROW EXECUTE FUNCTION
  ${M1_STORE_POSTGRES_SCHEMA}.reject_unpartitioned_market_fact_insert();

DROP TRIGGER IF EXISTS register_point_in_time_market_fact_identity
  ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE};
CREATE TRIGGER register_point_in_time_market_fact_identity
BEFORE INSERT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
FOR EACH ROW EXECUTE FUNCTION
  ${M1_STORE_POSTGRES_SCHEMA}.register_point_in_time_market_fact_identity();

DROP TRIGGER IF EXISTS reject_partitioned_fact_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE};
CREATE TRIGGER reject_partitioned_fact_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

DROP TRIGGER IF EXISTS reject_fact_partition_event_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE};
CREATE TRIGGER reject_fact_partition_event_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

DROP TRIGGER IF EXISTS reject_fact_backup_evidence_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE};
CREATE TRIGGER reject_fact_backup_evidence_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE}
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

DROP TRIGGER IF EXISTS reject_fact_retention_run_mutation
  ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE};
CREATE TRIGGER reject_fact_retention_run_mutation
BEFORE UPDATE OR DELETE ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
FOR EACH ROW EXECUTE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_ledger_mutation();

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
  p_start_day date,
  p_end_day date,
  p_release_id text
)
RETURNS TABLE (
  partition_name text,
  lower_bound timestamptz,
  upper_bound timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  partition_day date;
  target_name text;
  target_lower timestamptz;
  target_upper timestamptz;
  target_relation regclass;
  reviewed_event_count integer;
BEGIN
  IF p_release_id IS NULL OR btrim(p_release_id) = '' OR
    p_start_day IS NULL OR p_end_day IS NULL OR
    p_end_day < p_start_day OR p_end_day - p_start_day > 62 THEN
    RAISE EXCEPTION 'market fact partition request is invalid'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('market-radar-v2-m1-fact-partitions', 0));

  FOR partition_day IN
    SELECT generate_series(p_start_day, p_end_day, interval '1 day')::date
  LOOP
    target_name := 'point_in_time_market_fact_ledger_p' ||
      to_char(partition_day, 'YYYYMMDD');
    target_lower := partition_day::timestamp AT TIME ZONE 'UTC';
    target_upper := (partition_day + 1)::timestamp AT TIME ZONE 'UTC';
    target_relation := to_regclass('${M1_STORE_POSTGRES_SCHEMA}.' || target_name);

    SELECT count(*)::integer INTO reviewed_event_count
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS event
    WHERE event.partition_name = target_name
      AND event.event_type = 'CREATED'
      AND event.lower_bound = target_lower
      AND event.upper_bound = target_upper;

    IF target_relation IS NULL THEN
      IF reviewed_event_count <> 0 THEN
        RAISE EXCEPTION 'market fact partition registry points to a missing relation'
          USING ERRCODE = '55000';
      END IF;
      EXECUTE format(
        'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
        '${M1_STORE_POSTGRES_SCHEMA}',
        target_name,
        '${M1_STORE_POSTGRES_SCHEMA}',
        '${M1_PARTITIONED_FACT_TABLE}',
        target_lower,
        target_upper
      );
      INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} (
        event_id,
        event_type,
        partition_name,
        lower_bound,
        upper_bound,
        release_id,
        partition_policy_version,
        operator_identity
      ) VALUES (
        'created:' || target_name,
        'CREATED',
        target_name,
        target_lower,
        target_upper,
        p_release_id,
        '${M1_FACT_DAILY_PARTITION_POLICY_VERSION}',
        '${M1_FACT_RETENTION_IDENTITY}'
      );
      created := true;
    ELSE
      IF reviewed_event_count <> 1 THEN
        RAISE EXCEPTION 'unreviewed relation occupies a market fact partition name'
          USING ERRCODE = '55000';
      END IF;
      created := false;
    END IF;
    partition_name := target_name;
    lower_bound := target_lower;
    upper_bound := target_upper;
    RETURN NEXT;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.inspect_market_fact_partitions()
RETURNS TABLE (
  partition_name text,
  lower_bound timestamptz,
  upper_bound timestamptz,
  total_bytes bigint,
  estimated_rows bigint,
  created_at timestamptz,
  release_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    created.partition_name,
    created.lower_bound,
    created.upper_bound,
    pg_total_relation_size(
      to_regclass('${M1_STORE_POSTGRES_SCHEMA}.' || created.partition_name)
    )::bigint,
    greatest(classes.reltuples, 0)::bigint,
    created.occurred_at,
    created.release_id
  FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS created
  JOIN pg_namespace AS namespaces
    ON namespaces.nspname = '${M1_STORE_POSTGRES_SCHEMA}'
  JOIN pg_class AS classes
    ON classes.relnamespace = namespaces.oid
    AND classes.relname = created.partition_name
  WHERE created.event_type = 'CREATED'
    AND NOT EXISTS (
      SELECT 1
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS dropped
      WHERE dropped.partition_name = created.partition_name
        AND dropped.event_type = 'DROPPED'
    )
  ORDER BY created.lower_bound;
$function$;

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
  p_run_id text,
  p_cutoff_day date,
  p_release_id text,
  p_backup_evidence_id text
)
RETURNS TABLE (
  run_id text,
  release_id text,
  cutoff_day date,
  backup_evidence_id text,
  completed_at timestamptz,
  dropped_partition_count integer,
  dropped_fact_count bigint,
  dropped_total_bytes bigint,
  retention_identity text,
  session_identity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  candidate record;
  candidate_count bigint;
  candidate_bytes bigint;
  candidate_max_retain_until timestamptz;
  active_replay_exists boolean;
  total_partitions integer := 0;
  total_facts bigint := 0;
  total_bytes bigint := 0;
  maximum_upper_bound timestamptz := '-infinity'::timestamptz;
  completed timestamptz := clock_timestamp();
  backup record;
  deleted_identity_count bigint;
BEGIN
  IF p_run_id IS NULL OR btrim(p_run_id) = '' OR
    p_release_id IS NULL OR btrim(p_release_id) = '' OR
    p_backup_evidence_id IS NULL OR btrim(p_backup_evidence_id) = '' OR
    p_cutoff_day IS NULL OR
    p_cutoff_day > (completed AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'market fact retention request is invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    existing.run_id,
    existing.release_id,
    existing.cutoff_day,
    existing.backup_evidence_id,
    existing.completed_at,
    existing.dropped_partition_count,
    existing.dropped_fact_count,
    existing.dropped_total_bytes,
    existing.retention_identity,
    existing.session_identity
  FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} AS existing
  WHERE existing.run_id = p_run_id
    AND existing.release_id = p_release_id
    AND existing.cutoff_day = p_cutoff_day
    AND existing.backup_evidence_id = p_backup_evidence_id;
  IF FOUND THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
    WHERE ${M1_FACT_RETENTION_RUN_TABLE}.run_id = p_run_id
  ) THEN
    RAISE EXCEPTION 'market fact retention run id conflicts with another request'
      USING ERRCODE = '23505';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('market-radar-v2-m1-fact-partitions', 0));
  LOCK TABLE ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger IN SHARE MODE;

  FOR candidate IN
    SELECT created.partition_name, created.lower_bound, created.upper_bound
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS created
    WHERE created.event_type = 'CREATED'
      AND created.upper_bound <=
        (p_cutoff_day::timestamp AT TIME ZONE 'UTC')
      AND NOT EXISTS (
        SELECT 1
        FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS dropped
        WHERE dropped.partition_name = created.partition_name
          AND dropped.event_type = 'DROPPED'
      )
    ORDER BY created.lower_bound
  LOOP
    EXECUTE format(
      'LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',
      '${M1_STORE_POSTGRES_SCHEMA}',
      candidate.partition_name
    );
    EXECUTE format(
      'SELECT count(*)::bigint, coalesce(max(retain_until), %L::timestamptz), pg_total_relation_size(%L::regclass)::bigint FROM %I.%I',
      '-infinity',
      '${M1_STORE_POSTGRES_SCHEMA}.' || candidate.partition_name,
      '${M1_STORE_POSTGRES_SCHEMA}',
      candidate.partition_name
    ) INTO candidate_count, candidate_max_retain_until, candidate_bytes;
    IF candidate_max_retain_until > completed THEN
      RAISE EXCEPTION 'market fact partition still contains retained artifacts'
        USING ERRCODE = '55000';
    END IF;
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.replay_manifest_ledger AS manifest CROSS JOIN LATERAL jsonb_array_elements(manifest.payload->''sourceArtifacts'') AS reference WHERE manifest.retain_until > $1 AND reference->>''artifactName'' = ''PointInTimeMarketFact'' AND EXISTS (SELECT 1 FROM %I.%I AS fact WHERE fact.artifact_id = reference->>''artifactId''))',
      '${M1_STORE_POSTGRES_SCHEMA}',
      '${M1_STORE_POSTGRES_SCHEMA}',
      candidate.partition_name
    ) INTO active_replay_exists USING completed;
    IF active_replay_exists THEN
      RAISE EXCEPTION 'active replay evidence still references the market fact partition'
        USING ERRCODE = '55000';
    END IF;
    total_partitions := total_partitions + 1;
    total_facts := total_facts + candidate_count;
    total_bytes := total_bytes + candidate_bytes;
    maximum_upper_bound := greatest(maximum_upper_bound, candidate.upper_bound);
  END LOOP;

  SELECT * INTO backup
  FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE}
  WHERE evidence_id = p_backup_evidence_id;
  IF backup.evidence_id IS NULL OR
    backup.release_id <> p_release_id OR
    backup.restore_verified_at > completed OR
    (total_partitions > 0 AND backup.covered_through < maximum_upper_bound) OR
    backup.artifact_count < total_facts THEN
    RAISE EXCEPTION 'verified backup evidence does not cover the retention request'
      USING ERRCODE = '55000';
  END IF;

  FOR candidate IN
    SELECT created.partition_name, created.lower_bound, created.upper_bound
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS created
    WHERE created.event_type = 'CREATED'
      AND created.upper_bound <=
        (p_cutoff_day::timestamp AT TIME ZONE 'UTC')
      AND NOT EXISTS (
        SELECT 1
        FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS dropped
        WHERE dropped.partition_name = created.partition_name
          AND dropped.event_type = 'DROPPED'
      )
    ORDER BY created.lower_bound
  LOOP
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I.%I',
      '${M1_STORE_POSTGRES_SCHEMA}',
      candidate.partition_name
    ) INTO candidate_count;
    EXECUTE format(
      'DROP TABLE %I.%I',
      '${M1_STORE_POSTGRES_SCHEMA}',
      candidate.partition_name
    );
    DELETE FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}
    WHERE source_cutoff >= candidate.lower_bound
      AND source_cutoff < candidate.upper_bound;
    GET DIAGNOSTICS deleted_identity_count = ROW_COUNT;
    IF deleted_identity_count <> candidate_count THEN
      RAISE EXCEPTION 'market fact active identity cleanup count mismatch'
        USING ERRCODE = '55000';
    END IF;
    INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} (
      event_id,
      event_type,
      partition_name,
      lower_bound,
      upper_bound,
      release_id,
      partition_policy_version,
      retention_run_id,
      operator_identity
    ) VALUES (
      'dropped:' || p_run_id || ':' || candidate.partition_name,
      'DROPPED',
      candidate.partition_name,
      candidate.lower_bound,
      candidate.upper_bound,
      p_release_id,
      '${M1_FACT_DAILY_PARTITION_POLICY_VERSION}',
      p_run_id,
      '${M1_FACT_RETENTION_IDENTITY}'
    );
  END LOOP;

  INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} (
    run_id,
    release_id,
    cutoff_day,
    backup_evidence_id,
    completed_at,
    dropped_partition_count,
    dropped_fact_count,
    dropped_total_bytes,
    retention_identity
  ) VALUES (
    p_run_id,
    p_release_id,
    p_cutoff_day,
    p_backup_evidence_id,
    completed,
    total_partitions,
    total_facts,
    total_bytes,
    '${M1_FACT_RETENTION_IDENTITY}'
  );

  RETURN QUERY
  SELECT
    stored.run_id,
    stored.release_id,
    stored.cutoff_day,
    stored.backup_evidence_id,
    stored.completed_at,
    stored.dropped_partition_count,
    stored.dropped_fact_count,
    stored.dropped_total_bytes,
    stored.retention_identity,
    stored.session_identity
  FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} AS stored
  WHERE stored.run_id = p_run_id;
END
$function$;

ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.register_point_in_time_market_fact_identity()
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_unpartitioned_market_fact_insert()
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(date, date, text)
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.inspect_market_fact_partitions()
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(text, date, text, text)
  OWNER TO ${M1_STORE_IDENTITIES.migration};

ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE}
  OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
  OWNER TO ${M1_STORE_IDENTITIES.migration};

REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE} FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE} FROM PUBLIC;
REVOKE ALL ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.register_point_in_time_market_fact_identity()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.reject_unpartitioned_market_fact_insert()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(date, date, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.inspect_market_fact_partitions()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(text, date, text, text)
  FROM PUBLIC;

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE} TO
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.replay},
  ${M1_STORE_IDENTITIES.audit};
GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} TO
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
) ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
  TO ${M1_STORE_IDENTITIES.writer};

GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} TO
  ${M1_STORE_IDENTITIES.writer},
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.audit},
  ${M1_FACT_RETENTION_IDENTITY};
GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE} TO
  ${M1_STORE_IDENTITIES.audit},
  ${M1_FACT_RETENTION_IDENTITY};
GRANT INSERT (
  evidence_id,
  release_id,
  backup_created_at,
  restore_verified_at,
  covered_through,
  artifact_count,
  source_digest,
  target_identity
) ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE}
  TO ${M1_STORE_IDENTITIES.audit};
GRANT SELECT ON ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} TO
  ${M1_STORE_IDENTITIES.reader},
  ${M1_STORE_IDENTITIES.audit},
  ${M1_FACT_RETENTION_IDENTITY};

GRANT EXECUTE ON FUNCTION
  ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(date, date, text)
  TO ${M1_FACT_RETENTION_IDENTITY};
GRANT EXECUTE ON FUNCTION
  ${M1_STORE_POSTGRES_SCHEMA}.inspect_market_fact_partitions()
  TO ${M1_STORE_IDENTITIES.reader},
     ${M1_STORE_IDENTITIES.audit},
     ${M1_FACT_RETENTION_IDENTITY};
GRANT EXECUTE ON FUNCTION
  ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(text, date, text, text)
  TO ${M1_FACT_RETENTION_IDENTITY};
`;

export const M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM =
  stableContentHash({
    schemaVersion: M1_PARTITIONED_FACT_SCHEMA_VERSION,
    sql: M1_PARTITIONED_FACT_POSTGRES_SCHEMA_BODY.trim(),
  });

export const M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL = `
${M1_PARTITIONED_FACT_POSTGRES_SCHEMA_BODY}
INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations (version, checksum)
VALUES (
  '${M1_PARTITIONED_FACT_SCHEMA_VERSION}',
  '${M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM}'
)
ON CONFLICT (version) DO NOTHING;

DO $migration_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_PARTITIONED_FACT_SCHEMA_VERSION}'
      AND checksum = '${M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 partitioned fact schema version exists with a different checksum';
  END IF;
END
$migration_guard$;
`;
