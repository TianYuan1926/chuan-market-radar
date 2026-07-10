DO $roles$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'candidate_migration_role',
    'candidate_application_writer_role',
    'candidate_application_reader_role',
    'candidate_shadow_executor_role',
    'candidate_review_reader_role',
    'candidate_backup_restore_role',
    'candidate_audit_role'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        role_name
      );
    ELSE
      EXECUTE format(
        'ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        role_name
      );
    END IF;
  END LOOP;
END
$roles$;

REVOKE ALL ON SCHEMA candidate_authority FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA candidate_authority FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA candidate_authority FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA candidate_authority TO candidate_migration_role;
GRANT USAGE ON SCHEMA candidate_authority TO
  candidate_application_writer_role,
  candidate_application_reader_role,
  candidate_shadow_executor_role,
  candidate_review_reader_role,
  candidate_backup_restore_role,
  candidate_audit_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA candidate_authority TO candidate_migration_role;

GRANT SELECT ON
  candidate_authority.candidate_episodes,
  candidate_authority.candidate_episode_events,
  candidate_authority.candidate_episode_checkpoints,
  candidate_authority.candidate_episode_outcomes
TO candidate_application_reader_role;

GRANT SELECT ON
  candidate_authority.candidate_episodes,
  candidate_authority.candidate_episode_checkpoints,
  candidate_authority.candidate_episode_outcomes
TO candidate_review_reader_role;

GRANT SELECT ON ALL TABLES IN SCHEMA candidate_authority TO
  candidate_backup_restore_role,
  candidate_audit_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA candidate_authority REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA candidate_authority REVOKE ALL ON FUNCTIONS FROM PUBLIC;

ALTER SCHEMA candidate_authority OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.schema_migrations OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episodes OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episode_events OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episode_checkpoints OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episode_outcomes OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episode_ingest_outbox OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_episode_legacy_imports OWNER TO candidate_migration_role;
ALTER TABLE candidate_authority.candidate_migration_control OWNER TO candidate_migration_role;
