SET ROLE candidate_migration_role;

CREATE OR REPLACE FUNCTION candidate_authority.reject_immutable_row_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only and immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_candidate_parent_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  parent_row candidate_authority.candidate_episodes%ROWTYPE;
BEGIN
  IF NEW.parent_episode_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO parent_row
  FROM candidate_authority.candidate_episodes
  WHERE scope = NEW.scope AND episode_id = NEW.parent_episode_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent Episode does not exist' USING ERRCODE = '23503';
  END IF;
  IF parent_row.canonical_instrument_id <> NEW.canonical_instrument_id THEN
    RAISE EXCEPTION 'parent Episode instrument mismatch' USING ERRCODE = '23514';
  END IF;
  IF parent_row.closed_at IS NULL THEN
    RAISE EXCEPTION 'parent Episode must be closed' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE lineage AS (
      SELECT e.scope, e.episode_id, e.parent_episode_id
      FROM candidate_authority.candidate_episodes e
      WHERE e.scope = NEW.scope AND e.episode_id = NEW.parent_episode_id
      UNION ALL
      SELECT parent.scope, parent.episode_id, parent.parent_episode_id
      FROM candidate_authority.candidate_episodes parent
      JOIN lineage child
        ON parent.scope = child.scope AND parent.episode_id = child.parent_episode_id
    )
    SELECT 1 FROM lineage WHERE episode_id = NEW.episode_id
  ) THEN
    RAISE EXCEPTION 'parent Episode cycle rejected' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_candidate_episode_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF ROW(
    NEW.schema_version, NEW.scope, NEW.episode_id, NEW.canonical_instrument_id,
    NEW.venue_context, NEW.first_seen_at, NEW.observation_price,
    NEW.observation_price_fact_id, NEW.parent_episode_id, NEW.release_id,
    NEW.source_scan_cycle_id, NEW.created_at, NEW.created_by_runtime_id,
    NEW.idempotency_key
  ) IS DISTINCT FROM ROW(
    OLD.schema_version, OLD.scope, OLD.episode_id, OLD.canonical_instrument_id,
    OLD.venue_context, OLD.first_seen_at, OLD.observation_price,
    OLD.observation_price_fact_id, OLD.parent_episode_id, OLD.release_id,
    OLD.source_scan_cycle_id, OLD.created_at, OLD.created_by_runtime_id,
    OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION 'immutable Candidate Episode field changed' USING ERRCODE = '55000';
  END IF;

  IF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'Candidate Episode row_version must increment by one' USING ERRCODE = '40001';
  END IF;
  IF NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'last_seen_at cannot move backwards' USING ERRCODE = '23514';
  END IF;
  IF NOT (OLD.discovery_reasons <@ NEW.discovery_reasons) THEN
    RAISE EXCEPTION 'discovery reasons are append-only' USING ERRCODE = '23514';
  END IF;

  IF OLD.lifecycle = 'closed' THEN
    IF ROW(
      NEW.last_seen_at, NEW.discovery_reasons, NEW.priority_tier, NEW.lifecycle,
      NEW.maturity, NEW.direction_state, NEW.expires_at, NEW.closed_at, NEW.closed_reason
    ) IS DISTINCT FROM ROW(
      OLD.last_seen_at, OLD.discovery_reasons, OLD.priority_tier, OLD.lifecycle,
      OLD.maturity, OLD.direction_state, OLD.expires_at, OLD.closed_at, OLD.closed_reason
    ) THEN
      RAISE EXCEPTION 'closed Candidate Episode business state is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.lifecycle = OLD.lifecycle OR
    (OLD.lifecycle = 'discovered' AND NEW.lifecycle IN ('queued','closed')) OR
    (OLD.lifecycle = 'queued' AND NEW.lifecycle IN ('validated','closed')) OR
    (OLD.lifecycle = 'validated' AND NEW.lifecycle IN ('analyzed','closed')) OR
    (OLD.lifecycle = 'analyzed' AND NEW.lifecycle = 'closed')
  ) THEN
    RAISE EXCEPTION 'illegal Candidate lifecycle transition' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    NEW.direction_state = OLD.direction_state OR
    (OLD.direction_state = 'unknown' AND NEW.direction_state IN ('neutral','long','short')) OR
    (OLD.direction_state = 'neutral' AND NEW.direction_state IN ('long','short'))
  ) THEN
    RAISE EXCEPTION 'illegal direction transition; close and retrigger instead' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_event_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  current_version bigint;
BEGIN
  IF NEW.event_time > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'future Episode event time rejected' USING ERRCODE = '22007';
  END IF;
  SELECT row_version INTO current_version
  FROM candidate_authority.candidate_episodes
  WHERE scope = NEW.scope AND episode_id = NEW.episode_id;
  IF current_version IS NULL OR current_version <> NEW.stream_version THEN
    RAISE EXCEPTION 'event stream_version does not match Episode row_version' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_checkpoint_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed Checkpoint is immutable' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.schema_version, NEW.checkpoint_id, NEW.scope, NEW.episode_id,
    NEW.source_event_id, NEW.checkpoint_kind, NEW.due_at, NEW.window_start,
    NEW.window_end, NEW.finalize_by, NEW.retry_policy_version, NEW.max_attempts,
    NEW.release_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.schema_version, OLD.checkpoint_id, OLD.scope, OLD.episode_id,
    OLD.source_event_id, OLD.checkpoint_kind, OLD.due_at, OLD.window_start,
    OLD.window_end, OLD.finalize_by, OLD.retry_policy_version, OLD.max_attempts,
    OLD.release_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'immutable Checkpoint field changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.row_version <> OLD.row_version + 1 OR NEW.attempt_count < OLD.attempt_count OR NEW.fencing_token < OLD.fencing_token THEN
    RAISE EXCEPTION 'Checkpoint version/attempt/fence must be monotonic' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'claimed') OR
    (OLD.status = 'retry_wait' AND NEW.status = 'claimed') OR
    (OLD.status = 'claimed' AND NEW.status IN ('claimed','retry_wait','completed'))
  ) THEN
    RAISE EXCEPTION 'illegal Checkpoint transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_outbox_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed outbox item is immutable' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.outbox_id, NEW.scope, NEW.source_type, NEW.source_id, NEW.source_version,
    NEW.payload_version, NEW.payload, NEW.payload_hash, NEW.idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.outbox_id, OLD.scope, OLD.source_type, OLD.source_id, OLD.source_version,
    OLD.payload_version, OLD.payload, OLD.payload_hash, OLD.idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'immutable outbox payload changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count OR NEW.fencing_token < OLD.fencing_token THEN
    RAISE EXCEPTION 'outbox attempt/fence must be monotonic' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'claimed') OR
    (OLD.status = 'retry_wait' AND NEW.status = 'claimed') OR
    (OLD.status = 'claimed' AND NEW.status IN ('claimed','retry_wait','completed'))
  ) THEN
    RAISE EXCEPTION 'illegal outbox transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_legacy_import_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF ROW(
    NEW.import_id, NEW.migration_run_id, NEW.policy_version, NEW.source_system,
    NEW.source_snapshot_id, NEW.source_ref, NEW.source_row_hash, NEW.classification,
    NEW.exclusion_reasons, NEW.created_at, NEW.classified_at
  ) IS DISTINCT FROM ROW(
    OLD.import_id, OLD.migration_run_id, OLD.policy_version, OLD.source_system,
    OLD.source_snapshot_id, OLD.source_ref, OLD.source_row_hash, OLD.classification,
    OLD.exclusion_reasons, OLD.created_at, OLD.classified_at
  ) THEN
    RAISE EXCEPTION 'legacy classification is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.disposition <> 'quarantine' OR NEW.disposition NOT IN ('promoted','excluded') THEN
    RAISE EXCEPTION 'illegal legacy disposition transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.guard_migration_control_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF NEW.migration_id <> OLD.migration_id OR NEW.started_at <> OLD.started_at OR NEW.deadline_at <> OLD.deadline_at THEN
    RAISE EXCEPTION 'migration identity/deadline is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.epoch <> OLD.epoch + 1 OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'migration epoch/time must advance exactly once' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER candidate_episode_parent_guard_v1
BEFORE INSERT OR UPDATE ON candidate_authority.candidate_episodes
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_candidate_parent_v1();

CREATE TRIGGER candidate_episode_mutation_guard_v1
BEFORE UPDATE ON candidate_authority.candidate_episodes
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_candidate_episode_mutation_v1();

CREATE TRIGGER candidate_episode_event_insert_guard_v1
BEFORE INSERT ON candidate_authority.candidate_episode_events
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_event_insert_v1();

CREATE TRIGGER candidate_episode_event_immutable_v1
BEFORE UPDATE OR DELETE ON candidate_authority.candidate_episode_events
FOR EACH ROW EXECUTE FUNCTION candidate_authority.reject_immutable_row_mutation_v1();

CREATE TRIGGER candidate_episode_checkpoint_guard_v1
BEFORE UPDATE ON candidate_authority.candidate_episode_checkpoints
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_checkpoint_mutation_v1();

CREATE TRIGGER candidate_episode_outcome_immutable_v1
BEFORE UPDATE OR DELETE ON candidate_authority.candidate_episode_outcomes
FOR EACH ROW EXECUTE FUNCTION candidate_authority.reject_immutable_row_mutation_v1();

CREATE TRIGGER candidate_episode_outbox_guard_v1
BEFORE UPDATE ON candidate_authority.candidate_episode_ingest_outbox
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_outbox_mutation_v1();

CREATE TRIGGER candidate_episode_legacy_guard_v1
BEFORE UPDATE ON candidate_authority.candidate_episode_legacy_imports
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_legacy_import_mutation_v1();

CREATE TRIGGER candidate_migration_control_guard_v1
BEFORE UPDATE ON candidate_authority.candidate_migration_control
FOR EACH ROW EXECUTE FUNCTION candidate_authority.guard_migration_control_mutation_v1();

CREATE TRIGGER candidate_schema_migrations_immutable_v1
BEFORE UPDATE OR DELETE ON candidate_authority.schema_migrations
FOR EACH ROW EXECUTE FUNCTION candidate_authority.reject_immutable_row_mutation_v1();

CREATE OR REPLACE FUNCTION candidate_authority.open_or_refresh_episode_v1(
  p_scope text,
  p_episode_id uuid,
  p_event_id uuid,
  p_canonical_instrument_id text,
  p_venue_context jsonb,
  p_first_seen_at timestamptz,
  p_last_seen_at timestamptz,
  p_observation_price numeric,
  p_observation_price_fact_id text,
  p_discovery_reasons text[],
  p_priority_tier text,
  p_maturity text,
  p_direction_state text,
  p_expires_at timestamptz,
  p_release_id text,
  p_source_scan_cycle_id text,
  p_runtime_id text,
  p_idempotency_key text,
  p_command_hash text
)
RETURNS TABLE(result_episode_id uuid, created boolean, result_row_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  active_row candidate_authority.candidate_episodes%ROWTYPE;
  parent_id uuid;
  event_kind text;
  existing_event candidate_authority.candidate_episode_events%ROWTYPE;
BEGIN
  IF p_scope <> 'production_radar' THEN
    RAISE EXCEPTION 'unsupported Candidate scope' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(length(p_scope)::text || ':' || p_scope || '|' || p_canonical_instrument_id, 0));

  SELECT * INTO existing_event
  FROM candidate_authority.candidate_episode_events
  WHERE scope = p_scope AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash THEN
      RAISE EXCEPTION 'idempotency command hash conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY
      SELECT e.episode_id, false, e.row_version
      FROM candidate_authority.candidate_episodes e
      WHERE e.scope = p_scope AND e.episode_id = existing_event.episode_id;
    RETURN;
  END IF;

  SELECT * INTO active_row
  FROM candidate_authority.candidate_episodes
  WHERE scope = p_scope AND canonical_instrument_id = p_canonical_instrument_id AND closed_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    UPDATE candidate_authority.candidate_episodes e
    SET last_seen_at = GREATEST(e.last_seen_at, p_last_seen_at),
        discovery_reasons = ARRAY(
          SELECT DISTINCT reason
          FROM unnest(e.discovery_reasons || COALESCE(p_discovery_reasons, '{}')) reason
          ORDER BY reason
        ),
        priority_tier = p_priority_tier,
        maturity = p_maturity,
        direction_state = p_direction_state,
        expires_at = p_expires_at,
        updated_at = CURRENT_TIMESTAMP,
        row_version = e.row_version + 1
    WHERE e.scope = p_scope AND e.episode_id = active_row.episode_id
    RETURNING * INTO active_row;
    event_kind := 'REFRESHED';
  ELSE
    SELECT e.episode_id INTO parent_id
    FROM candidate_authority.candidate_episodes e
    WHERE e.scope = p_scope AND e.canonical_instrument_id = p_canonical_instrument_id AND e.closed_at IS NOT NULL
    ORDER BY e.closed_at DESC, e.created_at DESC
    LIMIT 1;

    INSERT INTO candidate_authority.candidate_episodes (
      schema_version, scope, episode_id, canonical_instrument_id, venue_context,
      first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
      discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
      expires_at, parent_episode_id, release_id, source_scan_cycle_id,
      created_by_runtime_id, idempotency_key, row_version
    ) VALUES (
      'candidate-episode.v1', p_scope, p_episode_id, p_canonical_instrument_id, p_venue_context,
      p_first_seen_at, p_last_seen_at, p_observation_price, p_observation_price_fact_id,
      COALESCE(p_discovery_reasons, '{}'), p_priority_tier, 'discovered', p_maturity, p_direction_state,
      p_expires_at, parent_id, p_release_id, p_source_scan_cycle_id,
      p_runtime_id, p_idempotency_key, 1
    ) RETURNING * INTO active_row;
    event_kind := CASE WHEN parent_id IS NULL THEN 'DISCOVERED' ELSE 'RETRIGGERED' END;
  END IF;

  INSERT INTO candidate_authority.candidate_episode_events (
    event_id, scope, episode_id, stream_version, event_type, event_time,
    source_fact_ids, source_scan_cycle_id, release_id, runtime_id,
    idempotency_key, command_hash, payload_version, payload
  ) VALUES (
    p_event_id, p_scope, active_row.episode_id, active_row.row_version, event_kind, p_last_seen_at,
    CASE WHEN p_observation_price_fact_id IS NULL THEN '{}' ELSE ARRAY[p_observation_price_fact_id] END,
    p_source_scan_cycle_id, p_release_id, p_runtime_id, p_idempotency_key,
    p_command_hash, 'candidate-event.v1',
    jsonb_build_object('canonicalInstrumentId', p_canonical_instrument_id, 'eventType', event_kind)
  );

  INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
    outbox_id, scope, source_type, source_id, source_version, payload_version,
    payload, payload_hash, idempotency_key, status
  ) VALUES (
    p_event_id, p_scope, 'candidate_episode_event', p_event_id::text,
    active_row.row_version::text, 'candidate-event.v1',
    jsonb_build_object('episodeId', active_row.episode_id, 'eventType', event_kind),
    p_command_hash, p_idempotency_key, 'pending'
  );

  RETURN QUERY SELECT active_row.episode_id, event_kind <> 'REFRESHED', active_row.row_version;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.close_episode_v1(
  p_scope text,
  p_episode_id uuid,
  p_event_id uuid,
  p_closed_at timestamptz,
  p_closed_reason text,
  p_release_id text,
  p_runtime_id text,
  p_idempotency_key text,
  p_command_hash text
)
RETURNS TABLE(result_episode_id uuid, result_row_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  episode_row candidate_authority.candidate_episodes%ROWTYPE;
  existing_event candidate_authority.candidate_episode_events%ROWTYPE;
BEGIN
  SELECT * INTO existing_event
  FROM candidate_authority.candidate_episode_events
  WHERE scope = p_scope AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash THEN
      RAISE EXCEPTION 'idempotency command hash conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT existing_event.episode_id, existing_event.stream_version;
    RETURN;
  END IF;

  SELECT * INTO episode_row
  FROM candidate_authority.candidate_episodes
  WHERE scope = p_scope AND episode_id = p_episode_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate Episode not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(length(p_scope)::text || ':' || p_scope || '|' || episode_row.canonical_instrument_id, 0));
  SELECT * INTO episode_row
  FROM candidate_authority.candidate_episodes
  WHERE scope = p_scope AND episode_id = p_episode_id
  FOR UPDATE;
  IF episode_row.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Candidate Episode already closed' USING ERRCODE = '55000';
  END IF;

  UPDATE candidate_authority.candidate_episodes e
  SET lifecycle = 'closed', closed_at = p_closed_at, closed_reason = p_closed_reason,
      updated_at = CURRENT_TIMESTAMP, row_version = e.row_version + 1
  WHERE e.scope = p_scope AND e.episode_id = p_episode_id
  RETURNING * INTO episode_row;

  INSERT INTO candidate_authority.candidate_episode_events (
    event_id, scope, episode_id, stream_version, event_type, event_time,
    release_id, runtime_id, idempotency_key, command_hash, payload_version, payload
  ) VALUES (
    p_event_id, p_scope, p_episode_id, episode_row.row_version, 'CLOSED', p_closed_at,
    p_release_id, p_runtime_id, p_idempotency_key, p_command_hash,
    'candidate-event.v1', jsonb_build_object('closedReason', p_closed_reason)
  );

  INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
    outbox_id, scope, source_type, source_id, source_version, payload_version,
    payload, payload_hash, idempotency_key, status
  ) VALUES (
    p_event_id, p_scope, 'candidate_episode_event', p_event_id::text,
    episode_row.row_version::text, 'candidate-event.v1',
    jsonb_build_object('episodeId', p_episode_id, 'eventType', 'CLOSED'),
    p_command_hash, p_idempotency_key, 'pending'
  );

  RETURN QUERY SELECT p_episode_id, episode_row.row_version;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.assert_episode_direction_v1(
  p_scope text,
  p_episode_id uuid,
  p_canonical_instrument_id text,
  p_expected_direction text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  episode_row candidate_authority.candidate_episodes%ROWTYPE;
BEGIN
  SELECT * INTO episode_row
  FROM candidate_authority.candidate_episodes
  WHERE scope = p_scope AND episode_id = p_episode_id;
  IF NOT FOUND
     OR episode_row.canonical_instrument_id <> p_canonical_instrument_id
     OR episode_row.direction_state <> p_expected_direction THEN
    RAISE EXCEPTION 'The persisted Episode direction does not match the reversal command'
      USING ERRCODE = '23514';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.schedule_checkpoint_v1(
  p_scope text,
  p_checkpoint_id uuid,
  p_episode_id uuid,
  p_source_event_id uuid,
  p_schedule_event_id uuid,
  p_checkpoint_kind text,
  p_due_at timestamptz,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_finalize_by timestamptz,
  p_release_id text,
  p_runtime_id text,
  p_idempotency_key text,
  p_command_hash text
)
RETURNS TABLE(result_checkpoint_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  version bigint;
  existing_id uuid;
  existing_event candidate_authority.candidate_episode_events%ROWTYPE;
BEGIN
  SELECT checkpoint_id INTO existing_id
  FROM candidate_authority.candidate_episode_checkpoints
  WHERE scope = p_scope AND source_event_id = p_source_event_id AND checkpoint_kind = p_checkpoint_kind;
  IF FOUND THEN
    SELECT * INTO existing_event
    FROM candidate_authority.candidate_episode_events
    WHERE scope = p_scope AND idempotency_key = p_idempotency_key;
    IF NOT FOUND OR existing_event.command_hash <> p_command_hash THEN
      RAISE EXCEPTION 'checkpoint schedule idempotency command hash conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT existing_id, false;
    RETURN;
  END IF;

  INSERT INTO candidate_authority.candidate_episode_checkpoints (
    schema_version, checkpoint_id, scope, episode_id, source_event_id,
    checkpoint_kind, due_at, window_start, window_end, finalize_by,
    retry_policy_version, status, release_id
  ) VALUES (
    'candidate-checkpoint.v1', p_checkpoint_id, p_scope, p_episode_id, p_source_event_id,
    p_checkpoint_kind, p_due_at, p_window_start, p_window_end, p_finalize_by,
    'checkpoint-retry.v1', 'pending', p_release_id
  );

  UPDATE candidate_authority.candidate_episodes e
  SET updated_at = CURRENT_TIMESTAMP, row_version = e.row_version + 1
  WHERE e.scope = p_scope AND e.episode_id = p_episode_id
  RETURNING row_version INTO version;

  INSERT INTO candidate_authority.candidate_episode_events (
    event_id, scope, episode_id, stream_version, event_type, event_time,
    source_scan_cycle_id, release_id, runtime_id, idempotency_key,
    command_hash, payload_version, payload
  )
  SELECT p_schedule_event_id, p_scope, p_episode_id, version, 'CHECKPOINT_SCHEDULED', p_window_start,
         source_scan_cycle_id, p_release_id, p_runtime_id, p_idempotency_key,
         p_command_hash, 'candidate-event.v1',
         jsonb_build_object('checkpointId', p_checkpoint_id, 'checkpointKind', p_checkpoint_kind)
  FROM candidate_authority.candidate_episodes
  WHERE scope = p_scope AND episode_id = p_episode_id;

  RETURN QUERY SELECT p_checkpoint_id, true;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.claim_checkpoints_v1(
  p_scope text,
  p_runtime_id text,
  p_now timestamptz,
  p_lease_seconds integer,
  p_limit integer
)
RETURNS SETOF candidate_authority.candidate_episode_checkpoints
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
  WITH due AS (
    SELECT scope, checkpoint_id
    FROM candidate_authority.candidate_episode_checkpoints
    WHERE scope = p_scope
      AND attempt_count < max_attempts
      AND (
        (status IN ('pending','retry_wait') AND due_at <= p_now AND (next_attempt_at IS NULL OR next_attempt_at <= p_now))
        OR (status = 'claimed' AND claim_expires_at <= p_now)
      )
    ORDER BY due_at, checkpoint_id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE candidate_authority.candidate_episode_checkpoints checkpoint
  SET status = 'claimed', attempt_count = checkpoint.attempt_count + 1,
      last_attempt_at = p_now, next_attempt_at = NULL, error_class = NULL,
      error_message_redacted = NULL, claimed_by_runtime_id = p_runtime_id,
      claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
      fencing_token = checkpoint.fencing_token + 1,
      updated_at = CURRENT_TIMESTAMP, row_version = checkpoint.row_version + 1
  FROM due
  WHERE checkpoint.scope = due.scope AND checkpoint.checkpoint_id = due.checkpoint_id
  RETURNING checkpoint.*
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.retry_checkpoint_v1(
  p_scope text,
  p_checkpoint_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_now timestamptz,
  p_next_attempt_at timestamptz,
  p_error_class text,
  p_error_message_redacted text,
  p_event_id uuid,
  p_idempotency_key text,
  p_command_hash text
)
RETURNS candidate_authority.candidate_episode_checkpoints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  checkpoint_row candidate_authority.candidate_episode_checkpoints%ROWTYPE;
  version bigint;
BEGIN
  SELECT * INTO checkpoint_row
  FROM candidate_authority.candidate_episode_checkpoints
  WHERE scope = p_scope AND checkpoint_id = p_checkpoint_id
  FOR UPDATE;
  IF checkpoint_row.status <> 'claimed' OR checkpoint_row.claimed_by_runtime_id <> p_runtime_id OR checkpoint_row.fencing_token <> p_fencing_token THEN
    RAISE EXCEPTION 'stale Checkpoint claim rejected' USING ERRCODE = '40001';
  END IF;

  UPDATE candidate_authority.candidate_episode_checkpoints checkpoint
  SET status = 'retry_wait', next_attempt_at = p_next_attempt_at,
      error_class = p_error_class, error_message_redacted = p_error_message_redacted,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP, row_version = checkpoint.row_version + 1
  WHERE checkpoint.scope = p_scope AND checkpoint.checkpoint_id = p_checkpoint_id
  RETURNING * INTO checkpoint_row;

  UPDATE candidate_authority.candidate_episodes episode
  SET updated_at = CURRENT_TIMESTAMP, row_version = episode.row_version + 1
  WHERE episode.scope = p_scope AND episode.episode_id = checkpoint_row.episode_id
  RETURNING row_version INTO version;

  INSERT INTO candidate_authority.candidate_episode_events (
    event_id, scope, episode_id, stream_version, event_type, event_time,
    release_id, runtime_id, idempotency_key, command_hash, payload_version, payload
  ) VALUES (
    p_event_id, p_scope, checkpoint_row.episode_id, version, 'CHECKPOINT_RETRIED', p_now,
    checkpoint_row.release_id, p_runtime_id, p_idempotency_key, p_command_hash,
    'candidate-event.v1', jsonb_build_object('checkpointId', p_checkpoint_id, 'errorClass', p_error_class)
  );

  RETURN checkpoint_row;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.record_outcome_v1(
  p_scope text,
  p_outcome_id uuid,
  p_checkpoint_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_status text,
  p_content_hash text,
  p_observation_price numeric,
  p_observation_price_fact_id text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_historical_source text,
  p_historical_instrument_id text,
  p_candle_interval text,
  p_expected_candles integer,
  p_actual_candles integer,
  p_missing_candles integer,
  p_duplicate_candles integer,
  p_coverage_ratio numeric,
  p_candle_set_hash text,
  p_mfe numeric,
  p_mae numeric,
  p_return_at_close numeric,
  p_evidence_grade boolean,
  p_evidence_grade_reasons text[],
  p_validated_at timestamptz,
  p_release_id text,
  p_runner_version text,
  p_recorded_at timestamptz,
  p_event_id uuid,
  p_idempotency_key text,
  p_command_hash text
)
RETURNS candidate_authority.candidate_episode_outcomes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  checkpoint_row candidate_authority.candidate_episode_checkpoints%ROWTYPE;
  outcome_row candidate_authority.candidate_episode_outcomes%ROWTYPE;
  version bigint;
  event_kind text;
BEGIN
  SELECT * INTO outcome_row
  FROM candidate_authority.candidate_episode_outcomes
  WHERE scope = p_scope AND checkpoint_id = p_checkpoint_id;
  IF FOUND THEN
    IF outcome_row.content_hash <> p_content_hash THEN
      RAISE EXCEPTION 'terminal Outcome content hash conflict' USING ERRCODE = '23505';
    END IF;
    RETURN outcome_row;
  END IF;

  SELECT * INTO checkpoint_row
  FROM candidate_authority.candidate_episode_checkpoints
  WHERE scope = p_scope AND checkpoint_id = p_checkpoint_id
  FOR UPDATE;
  IF checkpoint_row.status <> 'claimed'
     OR checkpoint_row.claimed_by_runtime_id <> p_runtime_id
     OR checkpoint_row.fencing_token <> p_fencing_token
     OR checkpoint_row.claim_expires_at < p_recorded_at THEN
    RAISE EXCEPTION 'stale Checkpoint fencing token rejected' USING ERRCODE = '40001';
  END IF;
  IF p_window_start <> checkpoint_row.window_start
     OR p_window_end <> checkpoint_row.window_end
     OR p_window_end > checkpoint_row.due_at
     OR p_validated_at < p_window_end
     OR p_recorded_at < p_window_end THEN
    RAISE EXCEPTION 'Outcome window/finalization does not match Checkpoint' USING ERRCODE = '23514';
  END IF;

  INSERT INTO candidate_authority.candidate_episode_outcomes (
    schema_version, outcome_id, scope, checkpoint_id, episode_id, source_event_id,
    checkpoint_kind, status, content_hash, observation_price, observation_price_fact_id,
    window_start, window_end, historical_source, historical_instrument_id, candle_interval,
    expected_candles, actual_candles, missing_candles, duplicate_candles, coverage_ratio,
    candle_set_hash, mfe, mae, return_at_close, evidence_grade, evidence_grade_version,
    evidence_grade_reasons, validated_at, release_id, runner_version, recorded_at
  ) VALUES (
    'candidate-outcome.v1', p_outcome_id, p_scope, p_checkpoint_id, checkpoint_row.episode_id,
    checkpoint_row.source_event_id, checkpoint_row.checkpoint_kind, p_status, p_content_hash,
    p_observation_price, p_observation_price_fact_id, p_window_start, p_window_end,
    p_historical_source, p_historical_instrument_id, p_candle_interval, p_expected_candles,
    p_actual_candles, p_missing_candles, p_duplicate_candles, p_coverage_ratio,
    p_candle_set_hash, p_mfe, p_mae, p_return_at_close, p_evidence_grade, 'eg.v1',
    COALESCE(p_evidence_grade_reasons, '{}'), p_validated_at, p_release_id,
    p_runner_version, p_recorded_at
  ) RETURNING * INTO outcome_row;

  UPDATE candidate_authority.candidate_episode_checkpoints checkpoint
  SET status = 'completed', claimed_by_runtime_id = NULL, claim_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP, row_version = checkpoint.row_version + 1
  WHERE checkpoint.scope = p_scope AND checkpoint.checkpoint_id = p_checkpoint_id;

  UPDATE candidate_authority.candidate_episodes episode
  SET updated_at = CURRENT_TIMESTAMP, row_version = episode.row_version + 1
  WHERE episode.scope = p_scope AND episode.episode_id = checkpoint_row.episode_id
  RETURNING row_version INTO version;

  event_kind := CASE p_status
    WHEN 'recorded' THEN 'OUTCOME_RECORDED'
    WHEN 'missed' THEN 'OUTCOME_MISSED'
    ELSE 'OUTCOME_UNAVAILABLE'
  END;
  INSERT INTO candidate_authority.candidate_episode_events (
    event_id, scope, episode_id, stream_version, event_type, event_time,
    release_id, runtime_id, idempotency_key, command_hash, payload_version, payload
  ) VALUES (
    p_event_id, p_scope, checkpoint_row.episode_id, version, event_kind, p_recorded_at,
    p_release_id, p_runtime_id, p_idempotency_key, p_command_hash,
    'candidate-event.v1', jsonb_build_object('checkpointId', p_checkpoint_id, 'outcomeId', p_outcome_id, 'status', p_status)
  );

  RETURN outcome_row;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.transition_migration_control_v1(
  p_migration_id text,
  p_expected_epoch bigint,
  p_phase text,
  p_write_frozen boolean,
  p_release_id text,
  p_approval_digest text,
  p_now timestamptz
)
RETURNS candidate_authority.candidate_migration_control
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  control_row candidate_authority.candidate_migration_control%ROWTYPE;
BEGIN
  SELECT * INTO control_row
  FROM candidate_authority.candidate_migration_control
  WHERE migration_id = p_migration_id
  FOR UPDATE;
  IF NOT FOUND OR control_row.epoch <> p_expected_epoch THEN
    RAISE EXCEPTION 'stale migration authority epoch' USING ERRCODE = '40001';
  END IF;
  IF p_now > control_row.deadline_at AND p_phase <> 'legacy' THEN
    RAISE EXCEPTION 'non-resettable migration deadline exceeded' USING ERRCODE = '55000';
  END IF;
  UPDATE candidate_authority.candidate_migration_control control
  SET phase = p_phase, epoch = control.epoch + 1, write_frozen = p_write_frozen,
      approved_release_id = p_release_id, approval_digest = p_approval_digest,
      updated_at = p_now
  WHERE control.migration_id = p_migration_id
  RETURNING * INTO control_row;
  RETURN control_row;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.assert_outbox_authority_epoch_v1(
  p_migration_id text,
  p_expected_epoch bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  control_row candidate_authority.candidate_migration_control%ROWTYPE;
BEGIN
  SELECT * INTO control_row
  FROM candidate_authority.candidate_migration_control
  WHERE migration_id = p_migration_id;
  IF NOT FOUND
     OR control_row.epoch <> p_expected_epoch
     OR control_row.phase NOT IN ('shadow_capture','shadow_verify','canonical_compat')
     OR control_row.write_frozen THEN
    RAISE EXCEPTION 'stale or inactive outbox authority epoch' USING ERRCODE = '40001';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.claim_outbox_v1(
  p_scope text,
  p_runtime_id text,
  p_now timestamptz,
  p_lease_seconds integer,
  p_limit integer,
  p_migration_id text,
  p_expected_epoch bigint
)
RETURNS SETOF candidate_authority.candidate_episode_ingest_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(p_migration_id, p_expected_epoch);
  RETURN QUERY
  WITH due AS (
    SELECT scope, outbox_id
    FROM candidate_authority.candidate_episode_ingest_outbox
    WHERE scope = p_scope
      AND (
        (status IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= p_now))
        OR (status = 'claimed' AND claim_expires_at <= p_now)
      )
    ORDER BY created_at, outbox_id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE candidate_authority.candidate_episode_ingest_outbox item
  SET status = 'claimed', attempt_count = item.attempt_count + 1,
      next_attempt_at = NULL, claimed_by_runtime_id = p_runtime_id,
      claim_expires_at = p_now + make_interval(secs => GREATEST(1, LEAST(p_lease_seconds, 900))),
      fencing_token = item.fencing_token + 1
  FROM due
  WHERE item.scope = due.scope AND item.outbox_id = due.outbox_id
  RETURNING item.*;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.retry_outbox_v1(
  p_scope text,
  p_outbox_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_now timestamptz,
  p_next_attempt_at timestamptz,
  p_migration_id text,
  p_expected_epoch bigint
)
RETURNS candidate_authority.candidate_episode_ingest_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  item candidate_authority.candidate_episode_ingest_outbox%ROWTYPE;
BEGIN
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(p_migration_id, p_expected_epoch);
  SELECT * INTO item FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND outbox_id = p_outbox_id FOR UPDATE;
  IF item.status <> 'claimed'
     OR item.claimed_by_runtime_id <> p_runtime_id
     OR item.fencing_token <> p_fencing_token
     OR item.claim_expires_at < p_now THEN
    RAISE EXCEPTION 'stale outbox fencing token rejected' USING ERRCODE = '40001';
  END IF;
  UPDATE candidate_authority.candidate_episode_ingest_outbox outbox
  SET status = 'retry_wait', next_attempt_at = p_next_attempt_at,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL
  WHERE outbox.scope = p_scope AND outbox.outbox_id = p_outbox_id
  RETURNING * INTO item;
  RETURN item;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.complete_outbox_v1(
  p_scope text,
  p_outbox_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_now timestamptz,
  p_payload_hash text,
  p_migration_id text,
  p_expected_epoch bigint
)
RETURNS candidate_authority.candidate_episode_ingest_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  item candidate_authority.candidate_episode_ingest_outbox%ROWTYPE;
BEGIN
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(p_migration_id, p_expected_epoch);
  SELECT * INTO item FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND outbox_id = p_outbox_id FOR UPDATE;
  IF item.payload_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'outbox payload hash conflict' USING ERRCODE = '23505';
  END IF;
  IF item.status = 'completed' THEN
    RETURN item;
  END IF;
  IF item.status <> 'claimed'
     OR item.claimed_by_runtime_id <> p_runtime_id
     OR item.fencing_token <> p_fencing_token
     OR item.claim_expires_at < p_now THEN
    RAISE EXCEPTION 'stale outbox fencing token rejected' USING ERRCODE = '40001';
  END IF;
  UPDATE candidate_authority.candidate_episode_ingest_outbox outbox
  SET status = 'completed', completed_at = p_now,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL
  WHERE outbox.scope = p_scope AND outbox.outbox_id = p_outbox_id
  RETURNING * INTO item;
  RETURN item;
END
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA candidate_authority FROM PUBLIC;
GRANT EXECUTE ON FUNCTION candidate_authority.open_or_refresh_episode_v1(
  text, uuid, uuid, text, jsonb, timestamptz, timestamptz, numeric, text,
  text[], text, text, text, timestamptz, text, text, text, text, text
) TO candidate_application_writer_role;
GRANT EXECUTE ON FUNCTION candidate_authority.close_episode_v1(
  text, uuid, uuid, timestamptz, text, text, text, text, text
) TO candidate_application_writer_role;
GRANT EXECUTE ON FUNCTION candidate_authority.assert_episode_direction_v1(
  text, uuid, text, text
) TO candidate_application_writer_role;
GRANT EXECUTE ON FUNCTION candidate_authority.schedule_checkpoint_v1(
  text, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text, text, text
) TO candidate_application_writer_role;
GRANT EXECUTE ON FUNCTION candidate_authority.claim_checkpoints_v1(
  text, text, timestamptz, integer, integer
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.retry_checkpoint_v1(
  text, uuid, text, bigint, timestamptz, timestamptz, text, text, uuid, text, text
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.record_outcome_v1(
  text, uuid, uuid, text, bigint, text, text, numeric, text, timestamptz,
  timestamptz, text, text, text, integer, integer, integer, integer, numeric,
  text, numeric, numeric, numeric, boolean, text[], timestamptz, text, text,
  timestamptz, uuid, text, text
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.transition_migration_control_v1(
  text, bigint, text, boolean, text, text, timestamptz
) TO candidate_migration_role;
GRANT EXECUTE ON FUNCTION candidate_authority.claim_outbox_v1(
  text, text, timestamptz, integer, integer, text, bigint
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.retry_outbox_v1(
  text, uuid, text, bigint, timestamptz, timestamptz, text, bigint
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.complete_outbox_v1(
  text, uuid, text, bigint, timestamptz, text, text, bigint
) TO candidate_shadow_executor_role;

RESET ROLE;
