CREATE TABLE "demo_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"start_ms" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"total" text NOT NULL,
	"token_symbol" text NOT NULL,
	"milestones_fired" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demo_push_session_idx" ON "demo_push_subscriptions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "demo_push_endpoint_idx" ON "demo_push_subscriptions" USING btree ("endpoint");