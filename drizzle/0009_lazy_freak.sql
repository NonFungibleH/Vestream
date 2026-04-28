CREATE TABLE "claim_events" (
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
	"claimed_at" timestamp NOT NULL,
	"tx_hash" text NOT NULL,
	"gas_native" text,
	"usd_value_at_claim" numeric,
	"price_confidence" text DEFAULT 'missing' NOT NULL,
	"gas_usd_value_at_claim" numeric,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_events_user_claimed_idx" ON "claim_events" USING btree ("user_id","claimed_at");--> statement-breakpoint
CREATE INDEX "claim_events_stream_idx" ON "claim_events" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_events_chain_tx_uq" ON "claim_events" USING btree ("chain_id","tx_hash","recipient","token_address");