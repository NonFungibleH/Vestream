-- NOTE (2026-09-14): renumbered on merge. This file was written as 0038 on
-- feat/unlock-basis-tax in July while main independently used the same number.
-- Already applied to production (table/column verified present), so this is a
-- no-op re-run — it is idempotent either way.
-- 0038_vesting_unlock_events.sql
-- Accrual-basis tax income: one row per computed unlock tranche (mirrors
-- claim_events, minus tx/gas — unlocks have no transaction — plus a manual-FMV
-- flag). Idempotent (IF NOT EXISTS) so it's safe to re-run and safe against the
-- archived/reset migration journal — the physical DB is the source of truth.
CREATE TABLE IF NOT EXISTS "vesting_unlock_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stream_id" text NOT NULL,
	"protocol" text NOT NULL,
	"chain_id" integer NOT NULL,
	"recipient" text NOT NULL,
	"token_address" text NOT NULL,
	"token_symbol" text,
	"token_decimals" integer NOT NULL,
	"amount" text NOT NULL,
	"unlock_time" timestamp NOT NULL,
	"tranche_key" text NOT NULL,
	"usd_value_at_unlock" numeric,
	"price_confidence" text DEFAULT 'missing' NOT NULL,
	"manual_price" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "vesting_unlock_events" ADD CONSTRAINT "vesting_unlock_events_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unlock_events_user_time_idx" ON "vesting_unlock_events" USING btree ("user_id","unlock_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unlock_events_stream_idx" ON "vesting_unlock_events" USING btree ("stream_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unlock_events_needs_price_idx" ON "vesting_unlock_events" USING btree ("price_confidence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unlock_events_user_tranche_uq" ON "vesting_unlock_events" USING btree ("user_id","tranche_key");
