CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episode_events (
  event_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'production_radar'),
  episode_id uuid NOT NULL,
  stream_version bigint NOT NULL CHECK (stream_version > 0),
  event_type text NOT NULL CHECK (event_type IN ('DISCOVERED','REFRESHED','QUEUED','VALIDATED','ANALYZED','MATURITY_CHANGED','DIRECTION_CHANGED','EXPIRED','INVALIDATED','BLOCKED','TRADE_PLAN_READY','CLOSED','RETRIGGERED','CHECKPOINT_SCHEDULED','CHECKPOINT_RETRIED','OUTCOME_RECORDED','OUTCOME_MISSED','OUTCOME_UNAVAILABLE')),
  event_time timestamptz NOT NULL,
  source_fact_ids text[] NOT NULL DEFAULT '{}',
  source_scan_cycle_id text,
  release_id text NOT NULL,
  runtime_id text NOT NULL,
  idempotency_key text NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_version text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, event_id),
  UNIQUE (scope, idempotency_key),
  UNIQUE (scope, episode_id, stream_version),
  FOREIGN KEY (scope, episode_id)
    REFERENCES candidate_authority.candidate_episodes(scope, episode_id)
);

CREATE INDEX IF NOT EXISTS candidate_episode_events_timeline_v1
  ON candidate_authority.candidate_episode_events(scope, episode_id, stream_version);

CREATE INDEX IF NOT EXISTS candidate_episode_events_type_time_v1
  ON candidate_authority.candidate_episode_events(scope, event_type, event_time DESC);
