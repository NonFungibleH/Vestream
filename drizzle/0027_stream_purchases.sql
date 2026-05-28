-- stream_purchases table: per-token buy transactions for P&L cost-basis tracking.
-- Mirrors stream_sales (already exists). Together these two tables let the web
-- dashboard and mobile app maintain a cross-device weighted-average cost basis
-- without relying on localStorage.
--
-- 2026-05-28 hand-rolled (Drizzle journal collision at 0009 — see 0026 comment).
-- Applied via:  node scripts/apply-migration.mjs drizzle/0027_stream_purchases.sql

CREATE TABLE IF NOT EXISTS "stream_purchases" (
  "id"            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       uuid      NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_address" text      NOT NULL,
  "purchase_date" text      NOT NULL,
  "amount"        text      NOT NULL,
  "price"         text      NOT NULL,
  "created_at"    timestamp NOT NULL DEFAULT now()
);

-- Lookup by (user, token) — the only query pattern used by the API routes.
CREATE INDEX IF NOT EXISTS "stream_purchases_user_token_idx"
  ON "stream_purchases" ("user_id", "token_address");
