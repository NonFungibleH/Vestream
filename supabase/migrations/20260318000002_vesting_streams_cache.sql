-- ── Persistent vesting stream cache ──────────────────────────────────────────
-- Stores normalised VestingStream objects indexed from on-chain subgraphs.
-- Keyed by the stream's composite ID (protocol-chainId-nativeId).
-- Immutable fields survive indefinitely; mutable fields refreshed every 5 min.

CREATE TABLE IF NOT EXISTS public.vesting_streams_cache (
  stream_id         TEXT        PRIMARY KEY,
  recipient         TEXT        NOT NULL,
  chain_id          INTEGER     NOT NULL,
  protocol          TEXT        NOT NULL,
  token_address     TEXT,
  token_symbol      TEXT,
  is_fully_vested   BOOLEAN     NOT NULL DEFAULT false,
  end_time          INTEGER,                              -- unix seconds
  stream_data       JSONB       NOT NULL,                -- full VestingStream JSON
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast wallet lookups
CREATE INDEX IF NOT EXISTS vsc_recipient_idx
  ON public.vesting_streams_cache (recipient);

CREATE INDEX IF NOT EXISTS vsc_recipient_chain_idx
  ON public.vesting_streams_cache (recipient, chain_id);

CREATE INDEX IF NOT EXISTS vsc_recipient_protocol_idx
  ON public.vesting_streams_cache (recipient, protocol);

-- Enable RLS — all access is via service role (server-side only)
ALTER TABLE public.vesting_streams_cache ENABLE ROW LEVEL SECURITY;
