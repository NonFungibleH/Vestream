-- 0037_scan_events.sql
-- User-initiated scan event log. Idempotent (IF NOT EXISTS) so it's safe to
-- re-run and safe against the archived/reset migration journal — the physical
-- DB is the source of truth here, not the drizzle journal.
CREATE TABLE IF NOT EXISTS "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_events_user_idx" ON "scan_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_events_created_idx" ON "scan_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_events_source_idx" ON "scan_events" USING btree ("source");
