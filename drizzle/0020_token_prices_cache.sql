-- Token prices cache — read-through cache for DexScreener / CoinGecko USD prices.
-- Shipped 2026-05-11 to make the TVL snapshot cron resilient against pricing-
-- API rate limits, and to enable a separate hourly cron that refreshes the
-- stalest entries without slamming external APIs all at once.
--
-- One row per (chain_id, token_address). Populated by both the daily TVL
-- snapshot cron AND the hourly refresh cron. Callers read with a maxAgeSec
-- to decide what's "fresh enough"; on miss/stale they fetch externally and
-- write back.

CREATE TABLE IF NOT EXISTS "token_prices_cache" (
  "chain_id"        integer NOT NULL,
  "token_address"   text NOT NULL,
  "price_usd"       numeric(40, 18) NOT NULL,
  "liquidity_usd"   numeric(40, 2),
  "source"          text NOT NULL,
  "fetched_at"      timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "token_prices_cache_chain_id_token_address_pk"
    PRIMARY KEY ("chain_id", "token_address")
);

-- The refresh cron's hot query: "give me the N stalest entries".
CREATE INDEX IF NOT EXISTS "token_prices_fetched_at_idx"
  ON "token_prices_cache" ("fetched_at");
