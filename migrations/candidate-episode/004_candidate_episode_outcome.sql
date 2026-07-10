CREATE TABLE IF NOT EXISTS candidate_authority.candidate_episode_outcomes (
  schema_version text NOT NULL CHECK (schema_version = 'candidate-outcome.v1'),
  outcome_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'production_radar'),
  checkpoint_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  checkpoint_kind text NOT NULL CHECK (checkpoint_kind IN ('1h','4h','24h')),
  status text NOT NULL CHECK (status IN ('recorded','missed','data_unavailable')),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  observation_price numeric(38,18),
  observation_price_fact_id text,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  historical_source text,
  historical_instrument_id text,
  candle_interval text CHECK (candle_interval IS NULL OR candle_interval = '1m'),
  expected_candles integer,
  actual_candles integer,
  missing_candles integer,
  duplicate_candles integer,
  coverage_ratio numeric(7,6),
  candle_set_hash text CHECK (candle_set_hash IS NULL OR candle_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  mfe numeric(18,8),
  mae numeric(18,8),
  return_at_close numeric(18,8),
  evidence_grade boolean NOT NULL,
  evidence_grade_version text NOT NULL CHECK (evidence_grade_version = 'eg.v1'),
  evidence_grade_reasons text[] NOT NULL DEFAULT '{}',
  validated_at timestamptz NOT NULL,
  release_id text NOT NULL,
  runner_version text NOT NULL,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, outcome_id),
  UNIQUE (scope, checkpoint_id),
  FOREIGN KEY (scope, checkpoint_id, episode_id, source_event_id, checkpoint_kind)
    REFERENCES candidate_authority.candidate_episode_checkpoints(scope, checkpoint_id, episode_id, source_event_id, checkpoint_kind),
  CHECK (window_start <= window_end),
  CHECK (validated_at >= window_end),
  CHECK (recorded_at >= window_end),
  CHECK (expected_candles IS NULL OR expected_candles > 0),
  CHECK (actual_candles IS NULL OR actual_candles >= 0),
  CHECK (missing_candles IS NULL OR missing_candles >= 0),
  CHECK (duplicate_candles IS NULL OR duplicate_candles >= 0),
  CHECK (coverage_ratio IS NULL OR coverage_ratio BETWEEN 0 AND 1),
  CHECK (
    (status = 'recorded' AND observation_price IS NOT NULL AND observation_price_fact_id IS NOT NULL
      AND observation_price > 0 AND historical_source IS NOT NULL AND historical_instrument_id IS NOT NULL AND candle_interval IS NOT NULL
      AND expected_candles IS NOT NULL AND actual_candles IS NOT NULL AND missing_candles IS NOT NULL AND duplicate_candles IS NOT NULL
      AND coverage_ratio IS NOT NULL AND candle_set_hash IS NOT NULL
      AND mfe IS NOT NULL AND mae IS NOT NULL)
    OR
    (status IN ('missed','data_unavailable') AND mfe IS NULL AND mae IS NULL AND return_at_close IS NULL AND evidence_grade = false)
  ),
  CHECK (
    (evidence_grade = true AND evidence_grade_version = 'eg.v1' AND cardinality(evidence_grade_reasons) = 0
      AND status = 'recorded' AND coverage_ratio = 1 AND missing_candles = 0 AND duplicate_candles = 0)
    OR
    (evidence_grade = false AND cardinality(evidence_grade_reasons) > 0)
  )
);

CREATE INDEX IF NOT EXISTS candidate_episode_outcomes_review_v1
  ON candidate_authority.candidate_episode_outcomes(scope, status, evidence_grade, recorded_at DESC);
