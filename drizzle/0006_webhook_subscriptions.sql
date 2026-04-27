-- Webhook subscriptions for Pro-tier developer API keys.
-- One row per "ping this URL when a matching unlock event fires".

CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"wallet_filter" text[],
	"protocol_filter" text[],
	"chain_filter" integer[],
	"events" text[] DEFAULT ARRAY['upcoming_unlock']::text[] NOT NULL,
	"hours_before" integer DEFAULT 24 NOT NULL,
	"last_fired_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "webhook_subscriptions"
	ADD CONSTRAINT "webhook_subscriptions_api_key_id_api_keys_id_fk"
	FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE cascade;

CREATE INDEX "webhook_subs_api_key_idx" ON "webhook_subscriptions" USING btree ("api_key_id");
