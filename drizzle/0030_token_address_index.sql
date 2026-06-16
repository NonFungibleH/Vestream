-- 0030_token_address_index.sql
-- Functional index on (chain_id, lower(token_address)) for vesting_streams_cache.
--
-- ROOT CAUSE of the 30s explorer→token-page navigation (and the
-- ERR_QUIC_PROTOCOL_ERROR retry storm): every token-keyed query filtered on
-- `lower(token_address)` / `token_address` with NO matching index, so each one
-- full-table-scanned the entire cache (tens of thousands of rows). Affected:
--   - fetchActiveStreams  (token-detail page: `lower(token_address) = $1`)
--   - getTokenScaleCounts (explorer wallet/round counts)
--   - getTotalLockedByToken (explorer supply share)
-- As the cache grew, those scans pushed the dynamic render past the HTTP/3
-- (QUIC) timeout → the browser retried → 30s+.
--
-- CONCURRENTLY = no table lock (safe on the live cache the crons write to).
-- IF NOT EXISTS = idempotent (the drizzle generate chain is broken; we apply
-- raw idempotent SQL — see CLAUDE.md "DB migrations").
CREATE INDEX CONCURRENTLY IF NOT EXISTS vsc_chain_lower_token_idx
  ON vesting_streams_cache (chain_id, lower(token_address));
