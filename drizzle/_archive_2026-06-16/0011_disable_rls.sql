-- Revert 0010_enable_rls.sql.
--
-- Production incident: enabling RLS on all 17 public tables broke read
-- access for our Drizzle / postgres-js client. The role used by our
-- DATABASE_URL did NOT have BYPASSRLS as I had assumed (Supabase's
-- pooler-authenticated role is not the underlying postgres superuser).
-- Result: every public protocol page started showing empty after
-- Vercel's unstable_cache TTL expired.
--
-- Reverting RLS unconditionally for now. The Supabase security alerts
-- come back, but that's a docs/strategy problem we solve deliberately
-- next session — not a "ship it during a production incident" problem.
--
-- Right strategy for a follow-up:
-- 1. Identify the exact role our DATABASE_URL connects as (run
--    `SELECT current_user;` from a Drizzle one-shot to confirm).
-- 2. Either grant that role BYPASSRLS, OR create a permissive policy
--    that allows that role full access:
--      CREATE POLICY "service_role_all" ON <table>
--        FOR ALL TO <our_role> USING (true) WITH CHECK (true);
-- 3. Re-enable RLS with that policy in place.
-- 4. Test on a staging table FIRST before applying to all 17.
--
-- Alternative path: switch our connection to use Supabase's
-- service_role JWT instead of the postgres connection string. The
-- service_role bypasses RLS by design.

ALTER TABLE "users"                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets"                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications_sent"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_events"             DISABLE ROW LEVEL SECURITY;
ALTER TABLE "watchlist"                DISABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_searches"           DISABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys"                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE "api_access_requests"      DISABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "waitlist"                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE "beta_feedback"            DISABLE ROW LEVEL SECURITY;
ALTER TABLE "vesting_streams_cache"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_tokens"            DISABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_otps"              DISABLE ROW LEVEL SECURITY;
ALTER TABLE "protocol_tvl_snapshots"   DISABLE ROW LEVEL SECURITY;
ALTER TABLE "demo_push_subscriptions"  DISABLE ROW LEVEL SECURITY;
