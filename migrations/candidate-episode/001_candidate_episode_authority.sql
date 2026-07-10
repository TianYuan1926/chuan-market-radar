CREATE SCHEMA IF NOT EXISTS candidate_authority;
REVOKE ALL ON SCHEMA candidate_authority FROM PUBLIC;

CREATE TABLE IF NOT EXISTS candidate_authority.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL UNIQUE,
  from_schema_fingerprint text NOT NULL,
  to_schema_fingerprint text NOT NULL,
  release_id text NOT NULL,
  approval_ref text NOT NULL,
  applied_at timestamptz NOT NULL,
  applied_by_role text NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
  status text NOT NULL CHECK (status IN ('applied','failed'))
);

CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episodes (
  schema_version text NOT NULL CHECK (schema_version = 'candidate-episode.v1'),
  scope text NOT NULL CHECK (scope = 'production_radar'),
  episode_id uuid NOT NULL,
  canonical_instrument_id text NOT NULL,
  venue_context jsonb NOT NULL CHECK (jsonb_typeof(venue_context) = 'object'),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  observation_price numeric(38,18),
  observation_price_fact_id text,
  discovery_reasons text[] NOT NULL DEFAULT '{}',
  priority_tier text NOT NULL,
  lifecycle text NOT NULL CHECK (lifecycle IN ('discovered','queued','validated','analyzed','closed')),
  maturity text NOT NULL CHECK (maturity IN ('light_candidate','deep_candidate','evidence_observe','wait','blocked','trade_plan_ready')),
  direction_state text NOT NULL CHECK (direction_state IN ('long','short','neutral','unknown')),
  expires_at timestamptz,
  closed_at timestamptz,
  closed_reason text CHECK (closed_reason IN ('expired','discovery_invalidated','structure_invalidated','direction_reversed','superseded','manual_closed','instrument_unavailable','scope_shutdown','release_retired')),
  parent_episode_id uuid,
  release_id text NOT NULL,
  source_scan_cycle_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_runtime_id text NOT NULL,
  idempotency_key text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (scope, episode_id),
  UNIQUE (scope, idempotency_key),
  FOREIGN KEY (scope, parent_episode_id)
    REFERENCES candidate_authority.candidate_episodes(scope, episode_id),
  CHECK (parent_episode_id IS NULL OR parent_episode_id <> episode_id),
  CHECK (last_seen_at >= first_seen_at),
  CHECK ((observation_price IS NULL AND observation_price_fact_id IS NULL) OR (observation_price > 0 AND observation_price_fact_id IS NOT NULL)),
  CHECK ((lifecycle = 'closed') = (closed_at IS NOT NULL AND closed_reason IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS candidate_episodes_one_active_v1
  ON candidate_authority.candidate_episodes(scope, canonical_instrument_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS candidate_episodes_history_v1
  ON candidate_authority.candidate_episodes(scope, canonical_instrument_id, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS candidate_episodes_active_queue_v1
  ON candidate_authority.candidate_episodes(scope, lifecycle, maturity, priority_tier, last_seen_at DESC)
  WHERE closed_at IS NULL;
