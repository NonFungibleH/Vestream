-- Growth dashboard schema additions (May 15 2026)
--
-- 1. users.last_active_at — touched by touchLastActive() on every
--    authenticated mobile API call. Drives DAU/WAU/MAU on /admin/growth.
-- 2. wallet_searches — every search across find-vestings / mobile portfolio
--    search / dashboard discover. Drives "top searched wallets" + search
--    activity panels on /admin/growth.
--
-- Drizzle journal has a known collision at 0009 (predates this session).
-- This migration is therefore hand-rolled SQL applied directly via
-- scripts/apply-migration.ts rather than `drizzle-kit migrate`. Same
-- pattern used for 0024 + 0025.

-- ── 1. users.last_active_at ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at timestamp;

-- Index for the DAU/WAU/MAU queries — without it a full-table scan happens
-- on every admin dashboard render. Partial index excludes users who've
-- never been active (the long tail) so the index stays small.
CREATE INDEX IF NOT EXISTS users_last_active_idx
  ON users (last_active_at)
  WHERE last_active_at IS NOT NULL;

-- ── 2. wallet_searches table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL,
  chain_id        integer,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  source          text NOT NULL,
  ip_hash         text,
  email_hash      text,
  created_at      timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_searches_wallet_idx
  ON wallet_searches (wallet_address);
CREATE INDEX IF NOT EXISTS wallet_searches_created_idx
  ON wallet_searches (created_at);
CREATE INDEX IF NOT EXISTS wallet_searches_user_idx
  ON wallet_searches (user_id);
