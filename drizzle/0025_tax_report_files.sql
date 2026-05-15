-- Persisted tax-export files for cross-surface visibility.
-- Shipped 2026-05-15 — Pro users generating CSV exports on the web
-- dashboard now get them mirrored to the mobile Tax Reports screen
-- so they can forward from their phone (typical "email to accountant"
-- workflow).
--
-- Content stored inline as text — CSVs are pure UTF-8, no BYTEA needed.
-- Average ~50KB per export; cleanup cron prunes >365d to bound growth.

CREATE TABLE IF NOT EXISTS "tax_report_files" (
  "id"           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid     NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "format"       text     NOT NULL,
  "filename"     text     NOT NULL,
  "size_bytes"   integer  NOT NULL,
  "row_count"    integer  NOT NULL DEFAULT 0,
  "content"      text     NOT NULL,
  "since_date"   timestamp,
  "until_date"   timestamp,
  "generated_at" timestamp DEFAULT now() NOT NULL
);

-- Mobile list endpoint: "N most-recent reports for this user".
CREATE INDEX IF NOT EXISTS "tax_report_files_user_generated_idx"
  ON "tax_report_files" ("user_id", "generated_at");

-- Cleanup cron: "delete everything older than N days".
CREATE INDEX IF NOT EXISTS "tax_report_files_generated_at_idx"
  ON "tax_report_files" ("generated_at");
