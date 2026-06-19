-- 0035_snapshot_heartbeat.sql
-- Heartbeat columns on protocol_tvl_snapshots so silently-frozen cells become
-- visible. computed_at = last SUCCESSFUL value; last_attempt_at advances on
-- every run (success OR failure); consecutive_failures climbs while a cell
-- can't refresh; last_error records why. See schema.ts for the rationale.
--
-- Idempotent (prod is shipped via raw DDL, NOT db:migrate — see CLAUDE.md).
ALTER TABLE protocol_tvl_snapshots ADD COLUMN IF NOT EXISTS last_attempt_at timestamp;
ALTER TABLE protocol_tvl_snapshots ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE protocol_tvl_snapshots ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
