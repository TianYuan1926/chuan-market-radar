import { stableContentHash } from "../../universe/stable-artifact";
import {
  M1_STORE_IDENTITIES,
} from "./contracts";
import {
  M1_FACT_PARTITION_POLICY_VERSION,
  M1_FACT_RETENTION_IDENTITY,
  M1_PARTITIONED_FACT_SCHEMA_VERSION,
  M1_PARTITIONED_FACT_SIX_HOUR_SCHEMA_VERSION,
} from "./partitioned-fact-contract";
import {
  M1_FACT_BACKUP_EVIDENCE_TABLE,
  M1_FACT_PARTITION_EVENT_TABLE,
  M1_FACT_RETENTION_RUN_TABLE,
  M1_PARTITIONED_FACT_IDENTITY_TABLE,
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
  M1_PARTITIONED_FACT_TABLE,
} from "./partitioned-fact-postgres-schema";
import { M1_STORE_POSTGRES_SCHEMA } from "./postgres-schema";

const M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_SCHEMA_BODY = `
DO $six_hour_migration_guard$
DECLARE
  already_applied boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_PARTITIONED_FACT_SCHEMA_VERSION}'
      AND checksum = '${M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 six-hour partition migration requires the exact v1 partition migration';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_PARTITIONED_FACT_SIX_HOUR_SCHEMA_VERSION}'
  ) INTO already_applied;

  IF NOT already_applied AND (
    EXISTS (
      SELECT 1
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
    ) OR EXISTS (
      SELECT 1
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}
    ) OR EXISTS (
      SELECT 1
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}
    ) OR EXISTS (
      SELECT 1
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
    ) OR EXISTS (
      SELECT 1
      FROM pg_inherits
      WHERE inhparent =
        '${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'M1 six-hour partition migration requires an empty v1 partition state'
      USING ERRCODE = '55000';
  END IF;
END
$six_hour_migration_guard$;

DROP FUNCTION IF EXISTS
  ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(date, date, text);
DROP FUNCTION IF EXISTS
  ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(text, date, text, text);

DO $retention_cutoff_column$
DECLARE
  cutoff_data_type text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '${M1_STORE_POSTGRES_SCHEMA}'
      AND table_name = '${M1_FACT_RETENTION_RUN_TABLE}'
      AND column_name = 'cutoff_day'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '${M1_STORE_POSTGRES_SCHEMA}'
      AND table_name = '${M1_FACT_RETENTION_RUN_TABLE}'
      AND column_name = 'cutoff_at'
  ) THEN
    ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
      RENAME COLUMN cutoff_day TO cutoff_at;
  END IF;

  SELECT data_type INTO cutoff_data_type
  FROM information_schema.columns
  WHERE table_schema = '${M1_STORE_POSTGRES_SCHEMA}'
    AND table_name = '${M1_FACT_RETENTION_RUN_TABLE}'
    AND column_name = 'cutoff_at';

  IF cutoff_data_type = 'date' THEN
    ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE}
      ALTER COLUMN cutoff_at TYPE timestamptz
      USING cutoff_at::timestamp AT TIME ZONE 'UTC';
  ELSIF cutoff_data_type IS DISTINCT FROM 'timestamp with time zone' THEN
    RAISE EXCEPTION 'M1 retention cutoff column has an unexpected type';
  END IF;
END
$retention_cutoff_column$;

DO $replace_partition_event_checks$
DECLARE
  check_name text;
BEGIN
  FOR check_name IN
    SELECT DISTINCT constraint_info.conname
    FROM pg_constraint AS constraint_info
    CROSS JOIN LATERAL unnest(constraint_info.conkey) AS key_column(attnum)
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = constraint_info.conrelid
      AND attribute.attnum = key_column.attnum
    WHERE constraint_info.conrelid =
      '${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}'::regclass
      AND constraint_info.contype = 'c'
      AND attribute.attname IN ('partition_name', 'partition_policy_version')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      '${M1_STORE_POSTGRES_SCHEMA}',
      '${M1_FACT_PARTITION_EVENT_TABLE}',
      check_name
    );
  END LOOP;
END
$replace_partition_event_checks$;

ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}
  ADD CONSTRAINT market_fact_partition_name_6h_check CHECK (
    partition_name ~
      '^point_in_time_market_fact_ledger_p[0-9]{8}_(00|06|12|18)$'
  );
ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE}
  ADD CONSTRAINT market_fact_partition_policy_6h_check CHECK (
    partition_policy_version = '${M1_FACT_PARTITION_POLICY_VERSION}'
  );

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
  p_start_at timestamptz,
  p_end_at timestamptz,
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
  partition_start timestamptz;
  target_name text;
  target_lower timestamptz;
  target_upper timestamptz;
  target_relation regclass;
  reviewed_event_count integer;
BEGIN
  IF p_release_id IS NULL OR btrim(p_release_id) = '' OR
    p_start_at IS NULL OR p_end_at IS NULL OR
    p_end_at < p_start_at OR
    p_end_at - p_start_at > interval '63 days' OR
    date_trunc('hour', p_start_at AT TIME ZONE 'UTC') <>
      p_start_at AT TIME ZONE 'UTC' OR
    date_trunc('hour', p_end_at AT TIME ZONE 'UTC') <>
      p_end_at AT TIME ZONE 'UTC' OR
    mod(extract(hour FROM p_start_at AT TIME ZONE 'UTC')::integer, 6) <> 0 OR
    mod(extract(hour FROM p_end_at AT TIME ZONE 'UTC')::integer, 6) <> 0 THEN
    RAISE EXCEPTION 'market fact six-hour partition request is invalid'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('market-radar-v2-m1-fact-partitions', 0)
  );

  FOR partition_start IN
    SELECT generate_series(p_start_at, p_end_at, interval '6 hours')
  LOOP
    target_name := 'point_in_time_market_fact_ledger_p' ||
      to_char(partition_start AT TIME ZONE 'UTC', 'YYYYMMDD_HH24');
    target_lower := partition_start;
    target_upper := partition_start + interval '6 hours';
    target_relation := to_regclass(
      '${M1_STORE_POSTGRES_SCHEMA}.' || target_name
    );

    SELECT count(*)::integer INTO reviewed_event_count
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS event
    WHERE event.partition_name = target_name
      AND event.event_type = 'CREATED'
      AND event.lower_bound = target_lower
      AND event.upper_bound = target_upper
      AND event.partition_policy_version = '${M1_FACT_PARTITION_POLICY_VERSION}';

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
        '${M1_FACT_PARTITION_POLICY_VERSION}',
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

CREATE OR REPLACE FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
  p_run_id text,
  p_cutoff_at timestamptz,
  p_release_id text,
  p_backup_evidence_id text
)
RETURNS TABLE (
  run_id text,
  release_id text,
  cutoff_at timestamptz,
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
    p_cutoff_at IS NULL OR p_cutoff_at > completed OR
    date_trunc('hour', p_cutoff_at AT TIME ZONE 'UTC') <>
      p_cutoff_at AT TIME ZONE 'UTC' THEN
    RAISE EXCEPTION 'market fact retention request is invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    existing.run_id,
    existing.release_id,
    existing.cutoff_at,
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
    AND existing.cutoff_at = p_cutoff_at
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('market-radar-v2-m1-fact-partitions', 0)
  );
  LOCK TABLE ${M1_STORE_POSTGRES_SCHEMA}.replay_manifest_ledger IN SHARE MODE;

  FOR candidate IN
    SELECT created.partition_name, created.lower_bound, created.upper_bound
    FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_PARTITION_EVENT_TABLE} AS created
    WHERE created.event_type = 'CREATED'
      AND created.upper_bound <= p_cutoff_at
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
      AND created.upper_bound <= p_cutoff_at
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
      '${M1_FACT_PARTITION_POLICY_VERSION}',
      p_run_id,
      '${M1_FACT_RETENTION_IDENTITY}'
    );
  END LOOP;

  INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_RETENTION_RUN_TABLE} (
    run_id,
    release_id,
    cutoff_at,
    backup_evidence_id,
    completed_at,
    dropped_partition_count,
    dropped_fact_count,
    dropped_total_bytes,
    retention_identity
  ) VALUES (
    p_run_id,
    p_release_id,
    p_cutoff_at,
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
    stored.cutoff_at,
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

ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
  timestamptz,
  timestamptz,
  text
) OWNER TO ${M1_STORE_IDENTITIES.migration};
ALTER FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
  text,
  timestamptz,
  text,
  text
) OWNER TO ${M1_STORE_IDENTITIES.migration};

REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
  timestamptz,
  timestamptz,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
  text,
  timestamptz,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
  timestamptz,
  timestamptz,
  text
) TO ${M1_FACT_RETENTION_IDENTITY};
GRANT EXECUTE ON FUNCTION ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
  text,
  timestamptz,
  text,
  text
) TO ${M1_FACT_RETENTION_IDENTITY};
`;

export const M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM =
  stableContentHash({
    schemaVersion: M1_PARTITIONED_FACT_SIX_HOUR_SCHEMA_VERSION,
    sql: M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_SCHEMA_BODY.trim(),
  });

export const M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_SQL = `
${M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_SCHEMA_BODY}
INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations (version, checksum)
VALUES (
  '${M1_PARTITIONED_FACT_SIX_HOUR_SCHEMA_VERSION}',
  '${M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM}'
)
ON CONFLICT (version) DO NOTHING;

DO $six_hour_migration_checksum_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
    WHERE version = '${M1_PARTITIONED_FACT_SIX_HOUR_SCHEMA_VERSION}'
      AND checksum = '${M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM}'
  ) THEN
    RAISE EXCEPTION 'M1 six-hour partition schema version exists with a different checksum';
  END IF;
END
$six_hour_migration_checksum_guard$;
`;
