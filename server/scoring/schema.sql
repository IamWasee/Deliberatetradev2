-- DeliberateTrade scoring — schema for behavior analytics.

-- Every tilt signal ever detected, immutable, for longitudinal analysis.
CREATE TABLE IF NOT EXISTS tilt_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL,              -- idempotency key: type:triggerId:offenderId
  type        text NOT NULL,              -- one of the six signal types
  severity    smallint NOT NULL CHECK (severity BETWEEN 1 AND 3),
  at          timestamptz NOT NULL,
  detail      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_tilt_events_user_time ON tilt_events (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_tilt_events_type ON tilt_events (type);

-- Per-day rollup used by the Readiness consistency component.
CREATE TABLE IF NOT EXISTS daily_stats (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          date NOT NULL,
  trades       int NOT NULL DEFAULT 0,
  pnl          numeric(14,2) NOT NULL DEFAULT 0,
  violations   int NOT NULL DEFAULT 0,
  tilt_signals int NOT NULL DEFAULT 0,
  good_day     boolean GENERATED ALWAYS AS (violations = 0 AND tilt_signals = 0) STORED,
  PRIMARY KEY (user_id, day)
);

-- Scores are snapshots for trend analysis; the live value is always
-- recomputed from source rows (never trusted from a client).
CREATE TABLE IF NOT EXISTS score_snapshots (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('process', 'readiness')),
  score       int NOT NULL CHECK (score BETWEEN 0 AND 100),
  stage       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_user ON score_snapshots (user_id, kind, created_at DESC);

-- Recompute hook: after every trade close, the API runs
--   1. detectTiltSignals(rows) → INSERT ... ON CONFLICT DO NOTHING
--   2. decideCooldown() → UPDATE users SET cooldown_until = $2 WHERE id = $1
--   3. UPDATE daily_stats (upsert today's row)
-- Scores themselves are computed on read — there is no client-writable
-- score column anywhere.
