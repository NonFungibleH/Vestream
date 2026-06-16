CREATE TABLE "protocol_tvl_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol" text NOT NULL,
	"chain_id" integer NOT NULL,
	"tvl_usd" numeric(24, 2) NOT NULL,
	"tvl_high" numeric(24, 2) DEFAULT '0' NOT NULL,
	"tvl_medium" numeric(24, 2) DEFAULT '0' NOT NULL,
	"tvl_low" numeric(24, 2) DEFAULT '0' NOT NULL,
	"stream_count" integer DEFAULT 0 NOT NULL,
	"tokens_priced" integer DEFAULT 0 NOT NULL,
	"tokens_total" integer DEFAULT 0 NOT NULL,
	"methodology" text NOT NULL,
	"top_contributors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ptvs_protocol_chain_idx" ON "protocol_tvl_snapshots" USING btree ("protocol","chain_id");--> statement-breakpoint
CREATE INDEX "ptvs_protocol_idx" ON "protocol_tvl_snapshots" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "ptvs_protocol_computed_idx" ON "protocol_tvl_snapshots" USING btree ("protocol","computed_at");