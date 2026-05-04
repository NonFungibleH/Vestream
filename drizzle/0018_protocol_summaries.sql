-- Migration 0018 — protocol_summaries materialised view
--
-- Pre-aggregated per-protocol rollup of vesting_streams_cache.
-- Written by the seeder cron at end-of-run; read by /protocols/[slug]
-- and /protocols index pages. Replaces the slow on-render aggregation
-- (getProtocolStats was 5+ seconds for Sablier despite the protocol
-- index added in migration 0017 — count(distinct ...) and array_agg
-- still scan the filtered partition).
--
-- Same pattern as status_summary in migration 0016. Tiny fixed-size
-- table, never grows beyond ~10 rows, sub-30ms reads forever.
--
-- Active-stream semantics (folded into the materialisation logic):
--   - vesting protocols: active = count where is_fully_vested = false
--   - stream  protocols: active = total
--     (continuously-flowing streams set isFullyVested=true to suppress
--      the cliff-countdown UI, but every flowing stream is by definition
--      active — fixes the "LlamaPay shows 0 active" bug)
--
-- Read path: getProtocolStats() in src/lib/vesting/protocol-stats.ts
-- now selects from protocol_summaries first; falls back to the legacy
-- aggregation only when the table is empty (fresh deploy before first
-- cron pass).

CREATE TABLE IF NOT EXISTS "protocol_summaries" (
  "protocol"          text       NOT NULL,
  "total_streams"     integer    NOT NULL DEFAULT 0,
  "active_streams"    integer    NOT NULL DEFAULT 0,
  "tokens_tracked"    integer    NOT NULL DEFAULT 0,
  "recipient_count"   integer    NOT NULL DEFAULT 0,
  "chain_ids"         jsonb      NOT NULL DEFAULT '[]'::jsonb,
  "last_indexed_at"   timestamp,
  "computed_at"       timestamp  NOT NULL DEFAULT now(),
  CONSTRAINT "protocol_summaries_pk" PRIMARY KEY ("protocol")
);
