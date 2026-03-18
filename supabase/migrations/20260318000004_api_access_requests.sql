CREATE TABLE IF NOT EXISTS public.api_access_requests (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  company    TEXT,
  use_case   TEXT        NOT NULL,
  protocols  TEXT[],
  reviewed   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_access_requests ENABLE ROW LEVEL SECURITY;
