-- Migration 0013 — stream annotations (custom names + notes).
--
-- Per-user, per-stream annotations table. Lets users rename streams away
-- from auto-generated labels ("Sablier stream #12345" → "Series A —
-- Acme Capital") and attach short context notes.
--
-- Design notes:
--   - Composite primary key (user_id, stream_id) — annotations are
--     personal context; same stream tracked by two users gets two
--     independent rows.
--   - stream_id is the canonical VestingStream.id format
--     ("{protocol}-{chainId}-{nativeId}") which is stable across cache
--     rebuilds.
--   - Sparse table — only annotated streams get a row. Most streams
--     never get annotated.
--   - notes column has no DB-level length cap; the 200-char cap is
--     enforced at the API layer so we can relax it later without a
--     migration.
--   - Cascade-deletes with the user. We don't cascade off
--     vesting_streams_cache because annotations should survive seeder
--     rebuilds (cache rows get deleted/re-created during deep seeds).
--   - Index on user_id supports the "all annotations for this user"
--     read pattern used by the dashboard's bulk-attach query.

CREATE TABLE IF NOT EXISTS "stream_annotations" (
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stream_id"   text NOT NULL,
  "custom_name" text,
  "notes"       text,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stream_annotations_user_id_stream_id_pk" PRIMARY KEY ("user_id", "stream_id")
);

CREATE INDEX IF NOT EXISTS "stream_annotations_user_idx"
  ON "stream_annotations" ("user_id");
