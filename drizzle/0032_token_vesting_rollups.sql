-- 0032_token_vesting_rollups.sql
-- Per-token vesting rollup. One row per (chain_id, lower(token_address))
-- holding the expensive per-token aggregates the explorer used to compute
-- LIVE on every render (getTotalLockedByToken's per-recipient nested
-- aggregate + getTokenScaleCounts). Those ballooned under Supabase pooler
-- load and were the recurring Cloudflare-524 root cause. A cron refreshes
-- this table in the background; the explorer does a single indexed read.
--
-- Idempotent raw SQL (drizzle generate chain re-baselined but prod still
-- ships via apply-migration.mjs — see CLAUDE.md "DB migrations").
CREATE TABLE IF NOT EXISTS token_vesting_rollups (
  chain_id          integer      NOT NULL,
  token_address     text         NOT NULL,   -- lowercased
  token_symbol      text,
  total_locked      text         NOT NULL DEFAULT '0',   -- stringified bigint
  top_holder_share  double precision,                    -- 0–1, largest recipient's share of locked
  wallet_count      integer      NOT NULL DEFAULT 0,
  round_count       integer      NOT NULL DEFAULT 0,
  stream_count      integer      NOT NULL DEFAULT 0,
  first_start       bigint,                              -- earliest active start (unix sec)
  last_end          bigint,                              -- latest active end (unix sec)
  has_cliff         boolean      NOT NULL DEFAULT false,
  computed_at       timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_address)
);
