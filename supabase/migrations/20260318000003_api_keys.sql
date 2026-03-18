-- ── Public API keys ──────────────────────────────────────────────────────────
-- Invite-only at launch. Keys issued via admin endpoint.
-- Plaintext key is never stored — only SHA-256 hash.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash          TEXT        NOT NULL UNIQUE,   -- SHA-256 of plaintext key
  key_prefix        TEXT        NOT NULL,           -- first 12 chars, for display
  owner_email       TEXT        NOT NULL,
  owner_name        TEXT,
  tier              TEXT        NOT NULL DEFAULT 'free',
  monthly_limit     INTEGER     NOT NULL DEFAULT 1000,
  usage_this_month  INTEGER     NOT NULL DEFAULT 0,
  usage_month_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at      TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_email_idx ON public.api_keys (owner_email);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
