-- Schema Copa 2026 (idempotente)
DO $$ BEGIN CREATE TYPE match_mode AS ENUM ('real', 'simulation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE match_status AS ENUM ('scheduled', 'live', 'finished'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('user', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(8) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  flag VARCHAR(16) NOT NULL,
  "group" CHAR(1) NOT NULL,
  confederation VARCHAR(20) NOT NULL
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach VARCHAR(120);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS probable_formation VARCHAR(10) DEFAULT '4-4-2';

CREATE TABLE IF NOT EXISTS groups_meta (
  id CHAR(1) PRIMARY KEY,
  name VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS group_teams (
  group_id CHAR(1) REFERENCES groups_meta(id) ON DELETE CASCADE,
  team_id VARCHAR(8) REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id VARCHAR(16) PRIMARY KEY,
  phase VARCHAR(16) NOT NULL,
  "group" CHAR(1),
  matchday SMALLINT,
  match_date DATE NOT NULL,
  match_time TIME NOT NULL,
  venue VARCHAR(200),
  home_team VARCHAR(8) REFERENCES teams(id),
  away_team VARCHAR(8) REFERENCES teams(id),
  label VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS match_results (
  match_id VARCHAR(16) REFERENCES matches(id) ON DELETE CASCADE,
  mode match_mode NOT NULL,
  home_score SMALLINT,
  away_score SMALLINT,
  status match_status NOT NULL DEFAULT 'scheduled',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, mode),
  CHECK (home_score IS NULL OR home_score >= 0),
  CHECK (away_score IS NULL OR away_score >= 0)
);

CREATE TABLE IF NOT EXISTS app_preferences (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  theme VARCHAR(10) NOT NULL DEFAULT 'dark',
  favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
  expanded_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_mode match_mode NOT NULL DEFAULT 'real',
  score_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_preferences ADD COLUMN IF NOT EXISTS score_sync_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS top_scorers (
  id SERIAL PRIMARY KEY,
  player VARCHAR(120) NOT NULL,
  team_id VARCHAR(8) REFERENCES teams(id),
  goals SMALLINT NOT NULL DEFAULT 0,
  assists SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS match_goals (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(16) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player VARCHAR(120),
  team_id VARCHAR(8) REFERENCES teams(id),
  minute SMALLINT,
  detail VARCHAR(60),
  assist_player VARCHAR(120),
  is_own_goal BOOLEAN NOT NULL DEFAULT false,
  counts_for_scorer BOOLEAN NOT NULL DEFAULT true,
  external_id VARCHAR(32) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'sportsdb',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, external_id)
);

ALTER TABLE match_goals ADD COLUMN IF NOT EXISTS is_own_goal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE match_goals ADD COLUMN IF NOT EXISTS counts_for_scorer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE match_goals ALTER COLUMN player DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_goals_match ON match_goals(match_id);
CREATE INDEX IF NOT EXISTS idx_match_goals_player ON match_goals(player, team_id);

CREATE TABLE IF NOT EXISTS sportsdb_teams (
  team_id VARCHAR(8) PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  sportsdb_id VARCHAR(16) NOT NULL
);

CREATE TABLE IF NOT EXISTS team_players (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(8) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player VARCHAR(120) NOT NULL,
  shirt_number SMALLINT,
  position VARCHAR(60),
  external_id VARCHAR(32),
  source VARCHAR(20) NOT NULL DEFAULT 'sportsdb',
  UNIQUE (team_id, player)
);

ALTER TABLE team_players ADD COLUMN IF NOT EXISTS shirt_name VARCHAR(60);
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS club VARCHAR(200);
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS height_cm SMALLINT;
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS is_probable_starter BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_team_players_team ON team_players(team_id, shirt_number);

CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date, match_time);
CREATE INDEX IF NOT EXISTS idx_match_results_mode ON match_results(mode);
