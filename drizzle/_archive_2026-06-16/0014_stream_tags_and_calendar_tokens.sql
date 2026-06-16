-- Migration 0014 — stream tags + calendar export tokens.
--
-- Two stickiness features shipping together:
--   1. Per-user, per-stream tags (free-form labels with optional colour).
--      Sister to stream_annotations (notes + custom names) shipped in 0013.
--   2. Per-user opaque calendar tokens for the public iCal feed.
--
-- Both follow the same per-user-cascade pattern as 0013. Both are
-- additive — no existing tables touched.
--
-- ─── stream_tags ─────────────────────────────────────────────────────────
-- Composite PK (user_id, stream_id, tag) — multiple tags per stream
-- allowed. Tag value lowercase-normalised at API layer. Colour stored as
-- "#RRGGBB" hex; nullable, with UI palette fallback.
--
-- Two indexes: user_id alone (for "all my tags" bulk read), and
-- (user_id, tag) (for "show me everything tagged X" filter).

CREATE TABLE IF NOT EXISTS "stream_tags" (
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stream_id"  text NOT NULL,
  "tag"        text NOT NULL,
  "color"      text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stream_tags_user_id_stream_id_tag_pk"
    PRIMARY KEY ("user_id", "stream_id", "tag")
);

CREATE INDEX IF NOT EXISTS "stream_tags_user_idx"
  ON "stream_tags" ("user_id");

CREATE INDEX IF NOT EXISTS "stream_tags_user_tag_idx"
  ON "stream_tags" ("user_id", "tag");

-- ─── calendar_tokens ────────────────────────────────────────────────────
-- One token per user (PK is user_id). Token format: `vstr_cal_{32 hex}`.
-- Token stored literally (no hash) because we need to look up by URL
-- parameter when the calendar app fetches the .ics feed.
--
-- last_fetched_at nullable — never-fetched tokens shouldn't lie about
-- subscription activity. Bumped from the .ics handler.

CREATE TABLE IF NOT EXISTS "calendar_tokens" (
  "user_id"         uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "token"           text NOT NULL UNIQUE,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "last_fetched_at" timestamp
);

CREATE INDEX IF NOT EXISTS "calendar_tokens_token_idx"
  ON "calendar_tokens" ("token");
