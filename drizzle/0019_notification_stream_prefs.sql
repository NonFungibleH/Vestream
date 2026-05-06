-- Migration 0019 — add per-token alert overrides + "next available claim" flag
-- to notification_preferences.
--
-- Background: the mobile Alerts tab let users toggle alerts per token
-- (Alert 1 / Alert 2 / per-stream timing) and toggle a "Next available
-- claim" alert globally, but the server's POST /api/mobile/notifications
-- handler dropped both fields silently. The Switch toggles appeared to
-- "not work" because they saved → server returned the stripped state →
-- the next refetch reverted the toggle. Root-cause fix May 2026.
--
-- streamPrefs is jsonb so adding new per-token fields later (e.g. a
-- third alert tier, custom messages) doesn't require a migration —
-- mirrors the saved_searches.params_json pattern.
--
-- IF NOT EXISTS guards make this idempotent against the manual psql
-- application that ran on May 6 2026 ahead of this file landing.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS stream_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notify_next_claim boolean NOT NULL DEFAULT true;
