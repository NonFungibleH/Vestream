-- ============================================================
-- Enable Row Level Security on all public-schema tables
-- ============================================================
-- The application accesses the database exclusively through
-- server-side Next.js API routes using the Supabase service_role
-- / postgres superuser connection (DATABASE_URL).  That role
-- bypasses RLS by design, so enabling RLS here does NOT affect
-- the running application.
--
-- What this fixes
-- ---------------
-- Without RLS, any request that reaches the Supabase PostgREST
-- endpoint using the anon or authenticated JWT can read/write
-- every row in these tables.  Enabling RLS with no permissive
-- policy for those roles means their default access is DENY ALL,
-- closing the external exposure that Supabase Security Advisor
-- flagged.
-- ============================================================

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- notifications_sent
ALTER TABLE public.notifications_sent ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- No permissive policies are added for anon / authenticated
-- because this application never exposes those roles to the
-- PostgREST layer.  The service_role connection used by the
-- server continues to have full access (it bypasses RLS).
-- ============================================================
