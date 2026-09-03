-- 0041: per-subscription dedup for web unlock alerts.
--
-- notifications_sent cannot be reused: its user_id carries a FK to users, and
-- a web subscriber has no user row by design. A subscription watches ONE wallet
-- and fires at most once per unlock event, so tracking the last event it fired
-- on is enough to prevent repeats across the 15-minute cron cadence.
-- Idempotent. Apply with: node scripts/apply-migration.mjs drizzle/0041_wallet_alert_dedup.sql

ALTER TABLE wallet_alert_subscriptions
  ADD COLUMN IF NOT EXISTS last_stream_id  text,
  ADD COLUMN IF NOT EXISTS last_unlock_at  timestamp;
