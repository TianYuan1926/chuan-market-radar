CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episode_ingest_outbox (
  outbox_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'production_radar'),
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_version text NOT NULL,
  payload_version text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','claimed','retry_wait','completed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  claimed_by_runtime_id text,
  claim_expires_at timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  PRIMARY KEY (scope, outbox_id),
  UNIQUE (scope, idempotency_key),
  UNIQUE (scope, source_type, source_id, source_version),
  CHECK ((status = 'claimed') = (claimed_by_runtime_id IS NOT NULL AND claim_expires_at IS NOT NULL)),
  CHECK (status <> 'retry_wait' OR next_attempt_at IS NOT NULL),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS candidate_episode_outbox_due_v1
  ON candidate_authority.candidate_episode_ingest_outbox(scope, created_at, next_attempt_at)
  WHERE status IN ('pending','retry_wait');

CREATE TABLE IF NOT EXISTS candidate_authority.candidate_migration_control (
  migration_id text PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('legacy','shadow_capture','shadow_verify','canonical_compat','canonical')),
  epoch bigint NOT NULL CHECK (epoch > 0),
  started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  write_frozen boolean NOT NULL DEFAULT false,
  approved_release_id text NOT NULL,
  approval_digest text NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (deadline_at > started_at),
  CHECK (deadline_at <= started_at + interval '72 hours')
);

CREATE INDEX IF NOT EXISTS candidate_migration_control_deadline_v1
  ON candidate_authority.candidate_migration_control(deadline_at, phase);
