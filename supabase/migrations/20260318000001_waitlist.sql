-- Create waitlist table for pre-launch email capture
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deny all direct PostgREST access (app uses service_role which bypasses RLS)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
