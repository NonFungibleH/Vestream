-- User profile additions (settings feature, 2026-06-15):
--   - display_name      → optional name for a personal dashboard greeting
--   - marketing_opt_in   → marketing-email opt-in flag (stored only for now;
--                          no provider wired to it yet — follow-up)
--
-- Additive + idempotent; existing rows default marketing_opt_in to false and
-- display_name to NULL. Matches schema.ts users table exactly.
--
-- Applied via:  node scripts/apply-migration.mjs drizzle/0029_user_profile.sql

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name"     text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_opt_in" boolean NOT NULL DEFAULT false;
