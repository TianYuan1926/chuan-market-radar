CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episode_checkpoints (
  schema_version text NOT NULL CHECK (schema_version = 'candidate-checkpoint.v1'),
  checkpoint_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'production_radar'),
  episode_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  checkpoint_kind text NOT NULL CHECK (checkpoint_kind IN ('1h','4h','24h')),
  due_at timestamptz NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  finalize_by timestamptz NOT NULL,
  retry_policy_version text NOT NULL CHECK (retry_policy_version = 'checkpoint-retry.v1'),
  status text NOT NULL CHECK (status IN ('pending','claimed','retry_wait','completed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  error_class text,
  error_message_redacted text,
  claimed_by_runtime_id text,
  claim_expires_at timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  release_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (scope, checkpoint_id),
  UNIQUE (scope, source_event_id, checkpoint_kind),
  UNIQUE (scope, checkpoint_id, episode_id, source_event_id, checkpoint_kind),
  FOREIGN KEY (scope, episode_id)
    REFERENCES candidate_authority.candidate_episodes(scope, episode_id),
  FOREIGN KEY (scope, source_event_id)
    REFERENCES candidate_authority.candidate_episode_events(scope, event_id),
  CHECK (window_start <= window_end AND window_end <= due_at AND due_at <= finalize_by),
  CHECK ((status = 'claimed') = (claimed_by_runtime_id IS NOT NULL AND claim_expires_at IS NOT NULL)),
  CHECK (status <> 'retry_wait' OR next_attempt_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS candidate_episode_checkpoints_due_v1
  ON candidate_authority.candidate_episode_checkpoints(scope, due_at, next_attempt_at)
  WHERE status IN ('pending','retry_wait');

CREATE INDEX IF NOT EXISTS candidate_episode_checkpoints_lease_v1
  ON candidate_authority.candidate_episode_checkpoints(scope, claim_expires_at)
  WHERE status = 'claimed';
