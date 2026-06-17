-- 0033_token_prices_market_cap.sql
-- Add circulating market cap to the price cache. Powers the explorer's
-- re-based unlock-risk metric (unlock value ÷ market cap) — replacing the old
-- "unlock ÷ locked supply" basis that flagged every single-wallet token HIGH.
-- DexScreener returns marketCap (falls back to fdv); CoinGecko-sourced rows
-- leave it null. Backfills on the normal hourly refresh-prices rotation.
ALTER TABLE token_prices_cache
  ADD COLUMN IF NOT EXISTS market_cap numeric(40, 2);
