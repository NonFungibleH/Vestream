CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"params_json" text NOT NULL,
	"alerts_enabled" boolean DEFAULT false NOT NULL,
	"last_notified_at" timestamp,
	"last_viewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"label" text,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"per_event_push" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"wallet_filter" text[],
	"protocol_filter" text[],
	"chain_filter" integer[],
	"events" text[] DEFAULT '{"upcoming_unlock"}' NOT NULL,
	"hours_before" integer DEFAULT 24 NOT NULL,
	"last_fired_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_chain_token_uq" ON "watchlist" USING btree ("user_id","chain_id","token_address");--> statement-breakpoint
CREATE INDEX "webhook_subs_api_key_idx" ON "webhook_subscriptions" USING btree ("api_key_id");