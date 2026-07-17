CREATE OR REPLACE FUNCTION candidate_authority.rollback_canonical_migration_control_v1(
  p_migration_id text,
  p_expected_epoch bigint,
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
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF NULLIF(btrim(p_migration_id), '') IS NULL
     OR NULLIF(btrim(p_release_id), '') IS NULL
     OR p_approval_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid canonical rollback identity' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO control_row
  FROM candidate_authority.candidate_migration_control
  WHERE migration_id = p_migration_id
  FOR UPDATE;

  IF NOT FOUND OR control_row.epoch <> p_expected_epoch THEN
    RAISE EXCEPTION 'stale migration authority epoch' USING ERRCODE = '40001';
  END IF;
  IF control_row.phase <> 'canonical' OR control_row.write_frozen THEN
    RAISE EXCEPTION 'canonical rollback requires active canonical authority' USING ERRCODE = '23514';
  END IF;

  UPDATE candidate_authority.candidate_migration_control control
  SET phase = 'legacy',
      epoch = control.epoch + 1,
      write_frozen = true,
      approved_release_id = p_release_id,
      approval_digest = p_approval_digest,
      updated_at = effective_now
  WHERE control.migration_id = p_migration_id
    AND control.epoch = p_expected_epoch
  RETURNING * INTO control_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale migration authority epoch' USING ERRCODE = '40001';
  END IF;
  RETURN control_row;
END
$function$;

REVOKE ALL ON FUNCTION candidate_authority.rollback_canonical_migration_control_v1(
  text, bigint, text, text
) FROM PUBLIC;
ALTER FUNCTION candidate_authority.rollback_canonical_migration_control_v1(
  text, bigint, text, text
) OWNER TO candidate_migration_role;
GRANT EXECUTE ON FUNCTION candidate_authority.rollback_canonical_migration_control_v1(
  text, bigint, text, text
) TO candidate_migration_role;

COMMENT ON FUNCTION candidate_authority.rollback_canonical_migration_control_v1(
  text, bigint, text, text
) IS 'Rollback-only canonical read authority transition to legacy/frozen; preserves candidate data and increments the fenced epoch.';
