-- Migration 0017 — vesting_streams_cache protocol indexes
--
-- EMERGENCY MIGRATION (May 4 2026). The /protocols/[slug] detail pages
-- and /status page were timing out at the Cloudflare 100s ceiling
-- because getProtocolStats() runs four aggregation queries per render
-- — each one filtering vesting_streams_cache by `protocol` alone with
-- no supporting index. EXPLAIN showed Seq Scan + external merge sort
-- = 5.8s for "where protocol = 'sablier'" (the largest cell).
--
-- Adding two indexes:
--
--   vsc_protocol_idx          — single column (protocol).
--                               Covers getProtocolStats, getLatestUnlock,
--                               and any future "show me everything for
--                               this protocol" path. Brings the slow
--                               query from 5800ms → 110ms.
--
--   vsc_protocol_end_time_idx — compound (protocol, end_time).
--                               Covers getUpcomingUnlocksForProtocol
--                               and getNextUpcomingUnlock — both filter
--                               by protocol + order by end_time. Lets
--                               the planner range-scan the hot tail
--                               without re-sorting 40k Sablier rows.
--
-- Both already created live in prod via `CREATE INDEX CONCURRENTLY`
-- (no table lock, safe under load). This migration captures the same
-- DDL so the schema-as-code matches reality and a future drizzle-kit
-- introspection won't try to drop them.

CREATE INDEX IF NOT EXISTS "vsc_protocol_idx"
  ON "vesting_streams_cache" ("protocol");

CREATE INDEX IF NOT EXISTS "vsc_protocol_end_time_idx"
  ON "vesting_streams_cache" ("protocol", "end_time");
