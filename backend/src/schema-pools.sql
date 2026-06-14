-- Schema Bolão (modo recreativo — idempotente)
DO $$ BEGIN CREATE TYPE pool_status AS ENUM ('draft', 'open', 'in_progress', 'closed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pool_visibility AS ENUM ('private', 'link', 'public'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pool_invite_status AS ENUM ('pending', 'accepted', 'declined', 'expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pool_score_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pool_score_rules_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS pools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  description TEXT,
  creator_id INT NOT NULL REFERENCES users(id),
  visibility pool_visibility NOT NULL DEFAULT 'private',
  status pool_status NOT NULL DEFAULT 'draft',
  score_rules_id INT NOT NULL REFERENCES pool_score_rules(id),
  join_deadline TIMESTAMPTZ,
  invite_token VARCHAR(64),
  allow_public_listing BOOLEAN NOT NULL DEFAULT false,
  show_participants BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT uq_pools_name UNIQUE (name),
  CONSTRAINT uq_pools_slug UNIQUE (slug),
  CONSTRAINT uq_pools_invite_token UNIQUE (invite_token)
);

CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(status);
CREATE INDEX IF NOT EXISTS idx_pools_visibility ON pools(visibility);
CREATE INDEX IF NOT EXISTS idx_pools_creator ON pools(creator_id);
CREATE INDEX IF NOT EXISTS idx_pools_public ON pools(visibility, allow_public_listing) WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS pool_matches (
  pool_id INT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  match_id VARCHAR(16) NOT NULL REFERENCES matches(id),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (pool_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_matches_match ON pool_matches(match_id);

CREATE TABLE IF NOT EXISTS pool_participants (
  id SERIAL PRIMARY KEY,
  pool_id INT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_points INT NOT NULL DEFAULT 0,
  exact_hits INT NOT NULL DEFAULT 0,
  result_hits INT NOT NULL DEFAULT 0,
  predictions_count INT NOT NULL DEFAULT 0,
  rank_position INT,
  ranking_updated_at TIMESTAMPTZ,
  CONSTRAINT uq_pool_participants_user UNIQUE (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_participants_pool ON pool_participants(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_participants_rank ON pool_participants(pool_id, total_points DESC);

CREATE TABLE IF NOT EXISTS pool_invites (
  id SERIAL PRIMARY KEY,
  pool_id INT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  inviter_id INT NOT NULL REFERENCES users(id),
  invitee_user_id INT REFERENCES users(id),
  invite_token VARCHAR(64),
  status pool_invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pool_invites_token UNIQUE (invite_token)
);

CREATE INDEX IF NOT EXISTS idx_pool_invites_pool ON pool_invites(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_invites_user ON pool_invites(invitee_user_id);

CREATE TABLE IF NOT EXISTS pool_predictions (
  id SERIAL PRIMARY KEY,
  pool_id INT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  participant_id INT NOT NULL REFERENCES pool_participants(id) ON DELETE CASCADE,
  match_id VARCHAR(16) NOT NULL REFERENCES matches(id),
  home_score SMALLINT NOT NULL,
  away_score SMALLINT NOT NULL,
  points_earned INT,
  locked_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pool_predictions_participant_match UNIQUE (participant_id, match_id),
  CHECK (home_score >= 0),
  CHECK (away_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pool_predictions_pool ON pool_predictions(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_predictions_match ON pool_predictions(match_id);

CREATE TABLE IF NOT EXISTS pool_audit_events (
  id SERIAL PRIMARY KEY,
  pool_id INT REFERENCES pools(id) ON DELETE SET NULL,
  user_id INT REFERENCES users(id),
  action VARCHAR(64) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_audit_pool ON pool_audit_events(pool_id, created_at DESC);
