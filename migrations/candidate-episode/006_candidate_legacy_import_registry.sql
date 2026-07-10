CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episode_legacy_imports (
  import_id uuid NOT NULL,
  migration_run_id text NOT NULL,
  policy_version text NOT NULL,
  source_system text NOT NULL,
  source_snapshot_id text NOT NULL,
  source_ref text NOT NULL,
  source_row_hash text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('deterministic','partial','unclassified','excluded')),
  disposition text NOT NULL CHECK (disposition IN ('quarantine','promoted','excluded')),
  exclusion_reasons text[] NOT NULL DEFAULT '{}',
  target_scope text,
  target_episode_id uuid,
  target_outcome_id uuid,
  target_row_hash text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classified_at timestamptz NOT NULL,
  promoted_at timestamptz,
  PRIMARY KEY (migration_run_id, import_id),
  UNIQUE (migration_run_id, source_system, source_row_hash),
  CHECK ((disposition = 'promoted') = (promoted_at IS NOT NULL)),
  CHECK (disposition <> 'promoted' OR classification = 'deterministic'),
  CHECK (disposition <> 'promoted' OR (target_scope IS NOT NULL AND target_row_hash IS NOT NULL)),
  CHECK (classification = 'deterministic' OR disposition <> 'promoted')
);

CREATE INDEX IF NOT EXISTS candidate_episode_legacy_classification_v1
  ON candidate_authority.candidate_episode_legacy_imports(migration_run_id, classification, disposition);

CREATE INDEX IF NOT EXISTS candidate_episode_legacy_target_v1
  ON candidate_authority.candidate_episode_legacy_imports(target_scope, target_episode_id, target_outcome_id)
  WHERE disposition = 'promoted';
