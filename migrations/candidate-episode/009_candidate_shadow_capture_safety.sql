SET ROLE candidate_migration_role;

ALTER TABLE candidate_authority.candidate_episode_ingest_outbox
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS error_message_redacted text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz;

ALTER TABLE candidate_authority.candidate_episode_ingest_outbox
  DROP CONSTRAINT candidate_episode_ingest_outbox_status_check,
  ADD CONSTRAINT candidate_episode_ingest_outbox_status_check
    CHECK (status IN ('pending','claimed','retry_wait','completed','quarantined')),
  ADD CONSTRAINT candidate_episode_ingest_outbox_max_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 8),
  ADD CONSTRAINT candidate_episode_ingest_outbox_error_class_check
    CHECK (error_class IS NULL OR error_class ~ '^[a-z0-9_]{1,64}$'),
  ADD CONSTRAINT candidate_episode_ingest_outbox_error_message_check
    CHECK (error_message_redacted IS NULL OR (
      length(error_message_redacted) BETWEEN 1 AND 256
      AND error_message_redacted !~ E'[\\r\\n]'
    )),
  ADD CONSTRAINT candidate_episode_ingest_outbox_quarantine_check
    CHECK ((status = 'quarantined') = (quarantined_at IS NOT NULL)),
  ADD CONSTRAINT candidate_episode_ingest_outbox_terminal_time_check
    CHECK (completed_at IS NULL OR completed_at >= created_at),
  ADD CONSTRAINT candidate_episode_ingest_outbox_quarantine_time_check
    CHECK (quarantined_at IS NULL OR quarantined_at >= created_at);

CREATE INDEX IF NOT EXISTS candidate_episode_outbox_quarantine_v2
  ON candidate_authority.candidate_episode_ingest_outbox(scope, quarantined_at, source_type)
  WHERE status = 'quarantined';

CREATE TABLE IF NOT EXISTS candidate_authority.candidate_outbox_quarantine_resolutions (
  resolution_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'production_radar'),
  quarantined_outbox_id uuid NOT NULL,
  resolution_action text NOT NULL CHECK (
    resolution_action IN ('replay_after_approved_fix','exclude_invalid_source')
  ),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9_]{1,64}$'),
  approval_ref text NOT NULL CHECK (
    length(approval_ref) BETWEEN 1 AND 128
    AND approval_ref ~ '^[A-Za-z0-9._:/-]+$'
  ),
  approval_digest text NOT NULL CHECK (approval_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_payload_hash text NOT NULL CHECK (source_payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  replacement_outbox_id uuid,
  resolved_by_role text NOT NULL,
  resolved_at timestamptz NOT NULL,
  PRIMARY KEY (scope, resolution_id),
  UNIQUE (scope, quarantined_outbox_id),
  FOREIGN KEY (scope, quarantined_outbox_id)
    REFERENCES candidate_authority.candidate_episode_ingest_outbox(scope, outbox_id),
  FOREIGN KEY (scope, replacement_outbox_id)
    REFERENCES candidate_authority.candidate_episode_ingest_outbox(scope, outbox_id),
  CHECK (
    (resolution_action = 'replay_after_approved_fix') = (replacement_outbox_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS candidate_outbox_quarantine_resolution_time_v3
  ON candidate_authority.candidate_outbox_quarantine_resolutions(scope, resolved_at DESC);

CREATE TRIGGER candidate_outbox_quarantine_resolution_immutable_v3
BEFORE UPDATE OR DELETE ON candidate_authority.candidate_outbox_quarantine_resolutions
FOR EACH ROW EXECUTE FUNCTION candidate_authority.reject_immutable_row_mutation_v1();

CREATE OR REPLACE FUNCTION candidate_authority.guard_outbox_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
BEGIN
  IF OLD.status IN ('completed','quarantined') THEN
    RAISE EXCEPTION 'terminal outbox item is immutable' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.outbox_id, NEW.scope, NEW.source_type, NEW.source_id, NEW.source_version,
    NEW.payload_version, NEW.payload, NEW.payload_hash, NEW.idempotency_key,
    NEW.max_attempts, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.outbox_id, OLD.scope, OLD.source_type, OLD.source_id, OLD.source_version,
    OLD.payload_version, OLD.payload, OLD.payload_hash, OLD.idempotency_key,
    OLD.max_attempts, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'immutable outbox payload changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count OR NEW.fencing_token < OLD.fencing_token THEN
    RAISE EXCEPTION 'outbox attempt/fence must be monotonic' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('claimed','quarantined')) OR
    (OLD.status = 'retry_wait' AND NEW.status IN ('claimed','quarantined')) OR
    (OLD.status = 'claimed' AND NEW.status IN ('claimed','retry_wait','completed','quarantined'))
  ) THEN
    RAISE EXCEPTION 'illegal outbox transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
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
  WHERE migration_id = p_migration_id
  FOR SHARE;
  IF NOT FOUND
     OR control_row.epoch <> p_expected_epoch
     OR control_row.phase NOT IN ('shadow_capture','shadow_verify','canonical_compat')
     OR control_row.write_frozen
     OR clock_timestamp() > control_row.deadline_at THEN
    RAISE EXCEPTION 'stale or inactive outbox authority epoch' USING ERRCODE = '40001';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.enqueue_shadow_candidate_outbox_v2(
  p_scope text,
  p_outbox_id uuid,
  p_source_id text,
  p_source_version text,
  p_payload jsonb,
  p_payload_hash text,
  p_idempotency_key text,
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
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(
    p_migration_id,
    p_expected_epoch
  );
  IF p_scope <> 'production_radar'
     OR p_source_id IS NULL OR btrim(p_source_id) = ''
     OR p_source_version IS NULL OR btrim(p_source_version) = ''
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
     OR jsonb_typeof(p_payload) <> 'object'
     OR p_payload_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid shadow candidate outbox command' USING ERRCODE = '23514';
  END IF;

  INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
    outbox_id, scope, source_type, source_id, source_version, payload_version,
    payload, payload_hash, idempotency_key, status, max_attempts
  ) VALUES (
    p_outbox_id, p_scope, 'legacy_scan_candidate', p_source_id, p_source_version,
    'shadow-candidate-observation.v1', p_payload, p_payload_hash,
    p_idempotency_key, 'pending', 8
  )
  ON CONFLICT (scope, idempotency_key) DO NOTHING;

  SELECT * INTO item
  FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND idempotency_key = p_idempotency_key;

  IF NOT FOUND
     OR item.source_type <> 'legacy_scan_candidate'
     OR item.source_id <> p_source_id
     OR item.source_version <> p_source_version
     OR item.payload_version <> 'shadow-candidate-observation.v1'
     OR item.payload_hash <> p_payload_hash
     OR item.payload IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'shadow candidate outbox idempotency hash conflict'
      USING ERRCODE = '23505';
  END IF;
  RETURN item;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.claim_shadow_candidate_outbox_v2(
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
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(
    p_migration_id,
    p_expected_epoch
  );

  UPDATE candidate_authority.candidate_episode_ingest_outbox item
  SET status = 'quarantined', next_attempt_at = NULL,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL,
      error_class = 'attempts_exhausted_after_lease',
      error_message_redacted = 'maximum delivery attempts exhausted',
      quarantined_at = p_now
  WHERE item.scope = p_scope
    AND item.source_type = 'legacy_scan_candidate'
    AND item.status IN ('pending','retry_wait','claimed')
    AND item.attempt_count >= item.max_attempts
    AND (item.status <> 'claimed' OR item.claim_expires_at <= p_now);

  RETURN QUERY
  WITH due AS (
    SELECT scope, outbox_id
    FROM candidate_authority.candidate_episode_ingest_outbox
    WHERE scope = p_scope
      AND source_type = 'legacy_scan_candidate'
      AND attempt_count < max_attempts
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
      fencing_token = item.fencing_token + 1,
      error_class = NULL, error_message_redacted = NULL
  FROM due
  WHERE item.scope = due.scope AND item.outbox_id = due.outbox_id
  RETURNING item.*;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.retry_or_quarantine_outbox_v2(
  p_scope text,
  p_outbox_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_now timestamptz,
  p_next_attempt_at timestamptz,
  p_error_class text,
  p_error_message_redacted text,
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
  next_status text;
BEGIN
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(
    p_migration_id,
    p_expected_epoch
  );
  SELECT * INTO item
  FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND outbox_id = p_outbox_id
  FOR UPDATE;
  IF item.status <> 'claimed'
     OR item.source_type <> 'legacy_scan_candidate'
     OR item.claimed_by_runtime_id <> p_runtime_id
     OR item.fencing_token <> p_fencing_token
     OR item.claim_expires_at < p_now THEN
    RAISE EXCEPTION 'stale shadow outbox fencing token rejected' USING ERRCODE = '40001';
  END IF;
  IF p_error_class !~ '^[a-z0-9_]{1,64}$'
     OR length(p_error_message_redacted) NOT BETWEEN 1 AND 256
     OR p_error_message_redacted ~ E'[\\r\\n]' THEN
    RAISE EXCEPTION 'invalid redacted shadow outbox error' USING ERRCODE = '23514';
  END IF;

  next_status := CASE
    WHEN item.attempt_count >= item.max_attempts THEN 'quarantined'
    ELSE 'retry_wait'
  END;
  IF next_status = 'retry_wait' AND p_next_attempt_at <= p_now THEN
    RAISE EXCEPTION 'next shadow retry must be in the future' USING ERRCODE = '23514';
  END IF;

  UPDATE candidate_authority.candidate_episode_ingest_outbox outbox
  SET status = next_status,
      next_attempt_at = CASE WHEN next_status = 'retry_wait' THEN p_next_attempt_at ELSE NULL END,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL,
      error_class = p_error_class,
      error_message_redacted = p_error_message_redacted,
      quarantined_at = CASE WHEN next_status = 'quarantined' THEN p_now ELSE NULL END
  WHERE outbox.scope = p_scope AND outbox.outbox_id = p_outbox_id
  RETURNING * INTO item;
  RETURN item;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.quarantine_outbox_v2(
  p_scope text,
  p_outbox_id uuid,
  p_runtime_id text,
  p_fencing_token bigint,
  p_now timestamptz,
  p_error_class text,
  p_error_message_redacted text,
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
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(
    p_migration_id,
    p_expected_epoch
  );
  SELECT * INTO item
  FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND outbox_id = p_outbox_id
  FOR UPDATE;
  IF item.status <> 'claimed'
     OR item.source_type <> 'legacy_scan_candidate'
     OR item.claimed_by_runtime_id <> p_runtime_id
     OR item.fencing_token <> p_fencing_token
     OR item.claim_expires_at < p_now THEN
    RAISE EXCEPTION 'stale shadow outbox fencing token rejected' USING ERRCODE = '40001';
  END IF;
  IF p_error_class !~ '^[a-z0-9_]{1,64}$'
     OR length(p_error_message_redacted) NOT BETWEEN 1 AND 256
     OR p_error_message_redacted ~ E'[\\r\\n]' THEN
    RAISE EXCEPTION 'invalid redacted shadow outbox error' USING ERRCODE = '23514';
  END IF;

  UPDATE candidate_authority.candidate_episode_ingest_outbox outbox
  SET status = 'quarantined', next_attempt_at = NULL,
      claimed_by_runtime_id = NULL, claim_expires_at = NULL,
      error_class = p_error_class,
      error_message_redacted = p_error_message_redacted,
      quarantined_at = p_now
  WHERE outbox.scope = p_scope AND outbox.outbox_id = p_outbox_id
  RETURNING * INTO item;
  RETURN item;
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.start_shadow_capture_v3(
  p_migration_id text,
  p_release_id text,
  p_approval_digest text
)
RETURNS candidate_authority.candidate_migration_control
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  control_row candidate_authority.candidate_migration_control%ROWTYPE;
  started_at_value timestamptz := clock_timestamp();
BEGIN
  IF p_migration_id IS NULL OR btrim(p_migration_id) = ''
     OR p_release_id IS NULL OR btrim(p_release_id) = ''
     OR p_approval_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid shadow capture start approval' USING ERRCODE = '23514';
  END IF;

  INSERT INTO candidate_authority.candidate_migration_control (
    migration_id, phase, epoch, started_at, deadline_at, write_frozen,
    approved_release_id, approval_digest, updated_at
  ) VALUES (
    p_migration_id, 'shadow_capture', 1, started_at_value,
    started_at_value + interval '72 hours', false,
    p_release_id, p_approval_digest, started_at_value
  )
  RETURNING * INTO control_row;

  RETURN control_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'shadow capture migration lifecycle cannot be restarted'
      USING ERRCODE = '55000';
END
$function$;

CREATE OR REPLACE FUNCTION candidate_authority.resolve_shadow_outbox_quarantine_v3(
  p_scope text,
  p_resolution_id uuid,
  p_quarantined_outbox_id uuid,
  p_resolution_action text,
  p_reason_code text,
  p_approval_ref text,
  p_approval_digest text,
  p_replacement_outbox_id uuid,
  p_replacement_payload jsonb,
  p_replacement_payload_hash text,
  p_migration_id text,
  p_expected_epoch bigint
)
RETURNS candidate_authority.candidate_outbox_quarantine_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, candidate_authority
AS $function$
DECLARE
  original candidate_authority.candidate_episode_ingest_outbox%ROWTYPE;
  existing candidate_authority.candidate_outbox_quarantine_resolutions%ROWTYPE;
  resolution candidate_authority.candidate_outbox_quarantine_resolutions%ROWTYPE;
BEGIN
  PERFORM candidate_authority.assert_outbox_authority_epoch_v1(
    p_migration_id,
    p_expected_epoch
  );
  IF p_scope <> 'production_radar'
     OR p_reason_code !~ '^[a-z0-9_]{1,64}$'
     OR length(p_approval_ref) NOT BETWEEN 1 AND 128
     OR p_approval_ref !~ '^[A-Za-z0-9._:/-]+$'
     OR p_approval_digest !~ '^sha256:[0-9a-f]{64}$'
     OR p_resolution_action NOT IN ('replay_after_approved_fix','exclude_invalid_source') THEN
    RAISE EXCEPTION 'invalid quarantine resolution approval' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO original
  FROM candidate_authority.candidate_episode_ingest_outbox
  WHERE scope = p_scope AND outbox_id = p_quarantined_outbox_id
  FOR UPDATE;
  IF NOT FOUND
     OR original.source_type <> 'legacy_scan_candidate'
     OR original.status <> 'quarantined' THEN
    RAISE EXCEPTION 'quarantine resolution requires a terminal shadow source item'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO existing
  FROM candidate_authority.candidate_outbox_quarantine_resolutions
  WHERE scope = p_scope AND quarantined_outbox_id = p_quarantined_outbox_id;
  IF FOUND THEN
    IF existing.resolution_id <> p_resolution_id
       OR existing.resolution_action <> p_resolution_action
       OR existing.reason_code <> p_reason_code
       OR existing.approval_ref <> p_approval_ref
       OR existing.approval_digest <> p_approval_digest
       OR existing.source_payload_hash <> original.payload_hash
       OR existing.replacement_outbox_id IS DISTINCT FROM p_replacement_outbox_id THEN
      RAISE EXCEPTION 'quarantine resolution idempotency conflict' USING ERRCODE = '23505';
    END IF;
    IF existing.resolution_action = 'replay_after_approved_fix' AND NOT EXISTS (
      SELECT 1
      FROM candidate_authority.candidate_episode_ingest_outbox replacement
      WHERE replacement.scope = existing.scope
        AND replacement.outbox_id = existing.replacement_outbox_id
        AND replacement.payload_hash = p_replacement_payload_hash
        AND replacement.payload IS NOT DISTINCT FROM p_replacement_payload
    ) THEN
      RAISE EXCEPTION 'quarantine replay payload idempotency conflict' USING ERRCODE = '23505';
    END IF;
    RETURN existing;
  END IF;

  IF p_resolution_action = 'replay_after_approved_fix' THEN
    IF p_replacement_outbox_id IS NULL
       OR jsonb_typeof(p_replacement_payload) <> 'object'
       OR p_replacement_payload_hash !~ '^sha256:[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'approved replay requires a bounded replacement payload'
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, max_attempts
    ) VALUES (
      p_replacement_outbox_id, p_scope, original.source_type, original.source_id,
      original.source_version || ':resolution:' || p_resolution_id::text,
      original.payload_version, p_replacement_payload, p_replacement_payload_hash,
      'shadow-quarantine-resolution:' || p_resolution_id::text, 'pending', 8
    );
  ELSIF p_replacement_outbox_id IS NOT NULL
        OR p_replacement_payload IS NOT NULL
        OR p_replacement_payload_hash IS NOT NULL THEN
    RAISE EXCEPTION 'approved exclusion cannot contain a replacement payload'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO candidate_authority.candidate_outbox_quarantine_resolutions (
    resolution_id, scope, quarantined_outbox_id, resolution_action, reason_code,
    approval_ref, approval_digest, source_payload_hash, replacement_outbox_id,
    resolved_by_role, resolved_at
  ) VALUES (
    p_resolution_id, p_scope, p_quarantined_outbox_id, p_resolution_action,
    p_reason_code, p_approval_ref, p_approval_digest, original.payload_hash,
    p_replacement_outbox_id, session_user, clock_timestamp()
  )
  RETURNING * INTO resolution;

  RETURN resolution;
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
  effective_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO control_row
  FROM candidate_authority.candidate_migration_control
  WHERE migration_id = p_migration_id
  FOR UPDATE;
  IF NOT FOUND OR control_row.epoch <> p_expected_epoch THEN
    RAISE EXCEPTION 'stale migration authority epoch' USING ERRCODE = '40001';
  END IF;
  IF effective_now > control_row.deadline_at AND p_phase <> 'legacy' THEN
    RAISE EXCEPTION 'non-resettable migration deadline exceeded' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (control_row.phase = 'legacy' AND p_phase = 'shadow_capture')
    OR (control_row.phase = 'shadow_capture' AND p_phase IN ('shadow_verify','legacy'))
    OR (control_row.phase = 'shadow_verify' AND p_phase IN ('canonical_compat','legacy'))
    OR (control_row.phase = 'canonical_compat' AND p_phase IN ('canonical','legacy'))
  ) THEN
    RAISE EXCEPTION 'illegal candidate migration phase transition' USING ERRCODE = '23514';
  END IF;
  IF p_phase IN ('shadow_verify','canonical_compat','canonical') AND EXISTS (
    SELECT 1
    FROM candidate_authority.candidate_episode_ingest_outbox outbox
    WHERE outbox.scope = 'production_radar'
      AND outbox.source_type = 'legacy_scan_candidate'
      AND outbox.status <> 'completed'
      AND NOT EXISTS (
        SELECT 1
        FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
        WHERE resolution.scope = outbox.scope
          AND resolution.quarantined_outbox_id = outbox.outbox_id
      )
  ) THEN
    RAISE EXCEPTION 'unresolved shadow outbox blocks phase advance' USING ERRCODE = '55000';
  END IF;

  UPDATE candidate_authority.candidate_migration_control control
  SET phase = p_phase, epoch = control.epoch + 1, write_frozen = p_write_frozen,
      approved_release_id = p_release_id, approval_digest = p_approval_digest,
      updated_at = effective_now
  WHERE control.migration_id = p_migration_id
  RETURNING * INTO control_row;
  RETURN control_row;
END
$function$;

REVOKE ALL ON FUNCTION candidate_authority.enqueue_shadow_candidate_outbox_v2(
  text, uuid, text, text, jsonb, text, text, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION candidate_authority.claim_shadow_candidate_outbox_v2(
  text, text, timestamptz, integer, integer, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION candidate_authority.retry_or_quarantine_outbox_v2(
  text, uuid, text, bigint, timestamptz, timestamptz, text, text, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION candidate_authority.quarantine_outbox_v2(
  text, uuid, text, bigint, timestamptz, text, text, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION candidate_authority.start_shadow_capture_v3(
  text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION candidate_authority.resolve_shadow_outbox_quarantine_v3(
  text, uuid, uuid, text, text, text, text, uuid, jsonb, text, text, bigint
) FROM PUBLIC;

REVOKE ALL ON TABLE candidate_authority.candidate_outbox_quarantine_resolutions FROM PUBLIC;
GRANT SELECT ON TABLE candidate_authority.candidate_outbox_quarantine_resolutions TO
  candidate_review_reader_role,
  candidate_backup_restore_role,
  candidate_audit_role;

GRANT EXECUTE ON FUNCTION candidate_authority.enqueue_shadow_candidate_outbox_v2(
  text, uuid, text, text, jsonb, text, text, text, bigint
) TO candidate_application_writer_role;
GRANT EXECUTE ON FUNCTION candidate_authority.claim_shadow_candidate_outbox_v2(
  text, text, timestamptz, integer, integer, text, bigint
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.retry_or_quarantine_outbox_v2(
  text, uuid, text, bigint, timestamptz, timestamptz, text, text, text, bigint
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.quarantine_outbox_v2(
  text, uuid, text, bigint, timestamptz, text, text, text, bigint
) TO candidate_shadow_executor_role;
GRANT EXECUTE ON FUNCTION candidate_authority.start_shadow_capture_v3(
  text, text, text
) TO candidate_migration_role;
GRANT EXECUTE ON FUNCTION candidate_authority.resolve_shadow_outbox_quarantine_v3(
  text, uuid, uuid, text, text, text, text, uuid, jsonb, text, text, bigint
) TO candidate_migration_role;

RESET ROLE;
