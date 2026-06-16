-- Enable Row Level Security on every public table.
--
-- Background: Supabase project flagged CRITICAL security issue
-- "rls_disabled_in_public" + "sensitive_columns_exposed" — our tables
-- (including `users`, `mobile_tokens`, `mobile_otps`, `api_keys`,
-- `waitlist`, `api_access_requests`) were reachable via Supabase's
-- public PostgREST API at https://<project>.supabase.co/rest/v1/<table>
-- using the project's anon key. Anyone with the URL + anon key (which is
-- exposed by design in the project's API settings) could read, edit, or
-- delete arbitrary rows.
--
-- Why this fix is safe:
-- - Our backend connects via DATABASE_URL using the `postgres` role,
--   which has BYPASSRLS in Supabase. Drizzle / postgres-js queries
--   continue to work unchanged.
-- - Enabling RLS WITHOUT POLICIES denies all anon + authenticated-key
--   access (PostgREST). This is what we want — we don't expose a
--   user-facing PostgREST API at all; every public read goes through
--   our /api/* routes which authenticate via iron-session and re-query
--   via Drizzle.
-- - If a future surface DOES need PostgREST access, add explicit policies
--   then. Default-deny is the safe baseline.
--
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security

ALTER TABLE "users"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications_sent"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_events"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "watchlist"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_searches"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_access_requests"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waitlist"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "beta_feedback"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vesting_streams_cache"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_tokens"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_otps"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "protocol_tvl_snapshots"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demo_push_subscriptions"   ENABLE ROW LEVEL SECURITY;
