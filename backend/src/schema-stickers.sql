-- Schema Álbum de Figurinhas (idempotente)
DO $$ BEGIN CREATE TYPE sticker_trade_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sticker_trade_direction AS ENUM ('offer', 'request'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL,
  name VARCHAR(160) NOT NULL,
  publisher VARCHAR(120),
  description TEXT,
  stickers_per_page SMALLINT NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_albums_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS album_stickers (
  id SERIAL PRIMARY KEY,
  album_id INT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'jogador',
  team_id VARCHAR(8) REFERENCES teams(id) ON DELETE SET NULL,
  page SMALLINT NOT NULL DEFAULT 1,
  sticker_type VARCHAR(24) NOT NULL DEFAULT 'comum',
  rarity VARCHAR(24),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_album_stickers_code UNIQUE (album_id, code)
);

CREATE INDEX IF NOT EXISTS idx_album_stickers_album ON album_stickers(album_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_album_stickers_category ON album_stickers(album_id, category);
CREATE INDEX IF NOT EXISTS idx_album_stickers_team ON album_stickers(team_id);
CREATE INDEX IF NOT EXISTS idx_album_stickers_page ON album_stickers(album_id, page);

CREATE TABLE IF NOT EXISTS user_sticker_inventory (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id INT NOT NULL REFERENCES album_stickers(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  reserved_for_trade INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_sticker UNIQUE (user_id, sticker_id),
  CONSTRAINT chk_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT chk_reserved_non_negative CHECK (reserved_for_trade >= 0),
  CONSTRAINT chk_reserved_within_duplicates CHECK (reserved_for_trade <= GREATEST(quantity - 1, 0))
);

CREATE INDEX IF NOT EXISTS idx_user_sticker_user ON user_sticker_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sticker_sticker ON user_sticker_inventory(sticker_id);

CREATE TABLE IF NOT EXISTS sticker_trade_offers (
  id SERIAL PRIMARY KEY,
  album_id INT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  status sticker_trade_status NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_offers_from ON sticker_trade_offers(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_offers_to ON sticker_trade_offers(to_user_id, status);

CREATE TABLE IF NOT EXISTS sticker_trade_matches (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES sticker_trade_offers(id) ON DELETE CASCADE,
  sticker_id INT NOT NULL REFERENCES album_stickers(id) ON DELETE CASCADE,
  direction sticker_trade_direction NOT NULL,
  quantity SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_match_quantity CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_trade_matches_offer ON sticker_trade_matches(offer_id);

CREATE TABLE IF NOT EXISTS sticker_trade_history (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES sticker_trade_offers(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_history_offer ON sticker_trade_history(offer_id);
