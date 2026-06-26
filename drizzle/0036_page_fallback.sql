-- Durable last-known-good cache for the public marketing pages
-- (/protocols and /protocols/[slug]).
--
-- Why: page-data-fallback.ts's "never show users an empty page" net was
-- backed ONLY by Upstash Redis (7-day TTL). On the Hobby tier Redis evicts
-- keys under memory pressure, so right after a deploy (the page's DB reads
-- short-circuit to empty during `next build`) or on a transient pooler blip,
-- the fallback was ITSELF empty and users saw the bare "Pricing indexed
-- tokens…" empty state. Postgres never evicts, so it's the durable backing
-- store. Redis stays as the fast L1; this table is the L2 that always has data.
--
-- One row per page key (e.g. "vestream:page-fallback:v1:index"). payload is
-- the rendered page-data object (same shape Redis stored). Idempotent.
CREATE TABLE IF NOT EXISTS page_fallback (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  updated_at  timestamp with time zone NOT NULL DEFAULT now()
);
