CREATE TABLE "api_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"use_case" text NOT NULL,
	"protocols" text[],
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_name" text,
	"tier" text DEFAULT 'free' NOT NULL,
	"monthly_limit" integer DEFAULT 1000 NOT NULL,
	"usage_this_month" integer DEFAULT 0 NOT NULL,
	"usage_month_start" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"notes" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "beta_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text,
	"rating" integer,
	"message" text NOT NULL,
	"page" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp,
	CONSTRAINT "calendar_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
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
CREATE TABLE "disposal_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"unique_id" text NOT NULL,
	"to_address" text NOT NULL,
	"amount_raw" text NOT NULL,
	"decimals" integer DEFAULT 18 NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"price_usd_at_time" numeric,
	"internal_transfer" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"protocol" text NOT NULL,
	"chain_id" integer NOT NULL,
	"last_scanned_block" bigint DEFAULT 0 NOT NULL,
	"last_confirmed_block" bigint DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"last_attempt_at" timestamp,
	"last_error" text,
	"last_event_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_state_protocol_chain_id_pk" PRIMARY KEY("protocol","chain_id")
);
--> statement-breakpoint
CREATE TABLE "mobile_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "mobile_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email" text,
	"hours_before_unlock" integer DEFAULT 24 NOT NULL,
	"notify_cliff" boolean DEFAULT true NOT NULL,
	"notify_stream_end" boolean DEFAULT true NOT NULL,
	"notify_monthly" boolean DEFAULT false NOT NULL,
	"stream_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify_next_claim" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stream_id" text NOT NULL,
	"unlock_timestamp" timestamp NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_wallet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text,
	"chain_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_summaries" (
	"protocol" text PRIMARY KEY NOT NULL,
	"total_streams" integer DEFAULT 0 NOT NULL,
	"active_streams" integer DEFAULT 0 NOT NULL,
	"tokens_tracked" integer DEFAULT 0 NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_indexed_at" timestamp,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "seeder_state" (
	"adapter_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"last_attempt_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"last_streams_written" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seeder_state_adapter_id_chain_id_pk" PRIMARY KEY("adapter_id","chain_id")
);
--> statement-breakpoint
CREATE TABLE "smart_money_snapshot" (
	"rank" integer PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"chain_ecosystem" text NOT NULL,
	"distinct_token_count" integer NOT NULL,
	"stream_count" integer NOT NULL,
	"total_locked_usd" numeric(24, 2),
	"top_tokens_json" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_summary" (
	"protocol" text NOT NULL,
	"chain_id" integer NOT NULL,
	"streams" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 0 NOT NULL,
	"with_token_symbol" integer DEFAULT 0 NOT NULL,
	"distinct_tokens" integer DEFAULT 0 NOT NULL,
	"freshest_sec" integer,
	"oldest_sec" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "status_summary_protocol_chain_id_pk" PRIMARY KEY("protocol","chain_id")
);
--> statement-breakpoint
CREATE TABLE "stream_annotations" (
	"user_id" uuid NOT NULL,
	"stream_id" text NOT NULL,
	"custom_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stream_annotations_user_id_stream_id_pk" PRIMARY KEY("user_id","stream_id")
);
--> statement-breakpoint
CREATE TABLE "stream_pnl" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_address" text NOT NULL,
	"entry_price" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_address" text NOT NULL,
	"purchase_date" text NOT NULL,
	"amount" text NOT NULL,
	"price" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_address" text NOT NULL,
	"sale_date" text NOT NULL,
	"amount" text NOT NULL,
	"price" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_tags" (
	"user_id" uuid NOT NULL,
	"stream_id" text NOT NULL,
	"tag" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stream_tags_user_id_stream_id_tag_pk" PRIMARY KEY("user_id","stream_id","tag")
);
--> statement-breakpoint
CREATE TABLE "tax_report_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"since_date" timestamp,
	"until_date" timestamp,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_prices_cache" (
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"price_usd" numeric(40, 18) NOT NULL,
	"liquidity_usd" numeric(40, 2),
	"source" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "token_prices_cache_chain_id_token_address_pk" PRIMARY KEY("chain_id","token_address")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"scan_window_start" timestamp,
	"settings_changed_at" timestamp,
	"user_type" text,
	"vesting_count" text,
	"current_tracking" text,
	"audience_category" text,
	"onboarding_completed_at" timestamp,
	"expo_push_token" text,
	"trial_ends_at" timestamp,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"push_alerts_sent" integer DEFAULT 0 NOT NULL,
	"push_alerts_month_start" timestamp,
	"last_active_at" timestamp,
	"timezone" text,
	"display_name" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "vesting_streams_cache" (
	"stream_id" text PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"chain_id" integer NOT NULL,
	"protocol" text NOT NULL,
	"token_address" text,
	"token_symbol" text,
	"is_fully_vested" boolean DEFAULT false NOT NULL,
	"end_time" bigint,
	"stream_data" jsonb NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"chain_id" integer,
	"user_id" uuid,
	"source" text NOT NULL,
	"ip_hash" text,
	"email_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"chains" text[],
	"protocols" text[],
	"token_address" text,
	"added_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "webhook_event_dedup" (
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_event_dedup_event_id_source_pk" PRIMARY KEY("event_id","source")
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
ALTER TABLE "calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal_candidates" ADD CONSTRAINT "disposal_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_tokens" ADD CONSTRAINT "mobile_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_annotations" ADD CONSTRAINT "stream_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_pnl" ADD CONSTRAINT "stream_pnl_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_purchases" ADD CONSTRAINT "stream_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sales" ADD CONSTRAINT "stream_sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_tags" ADD CONSTRAINT "stream_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_report_files" ADD CONSTRAINT "tax_report_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_searches" ADD CONSTRAINT "wallet_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_tokens_token_idx" ON "calendar_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "claim_events_user_claimed_idx" ON "claim_events" USING btree ("user_id","claimed_at");--> statement-breakpoint
CREATE INDEX "claim_events_stream_idx" ON "claim_events" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_events_chain_tx_uq" ON "claim_events" USING btree ("chain_id","tx_hash","recipient","token_address");--> statement-breakpoint
CREATE INDEX "demo_push_session_idx" ON "demo_push_subscriptions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "demo_push_endpoint_idx" ON "demo_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "disposal_candidates_dedup_idx" ON "disposal_candidates" USING btree ("user_id","chain_id","tx_hash","unique_id");--> statement-breakpoint
CREATE INDEX "disposal_candidates_user_token_idx" ON "disposal_candidates" USING btree ("user_id","token_address");--> statement-breakpoint
CREATE INDEX "indexer_state_last_run_idx" ON "indexer_state" USING btree ("last_run_at");--> statement-breakpoint
CREATE INDEX "mobile_tokens_user_idx" ON "mobile_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_wallet_links_email_idx" ON "pending_wallet_links" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_wallet_links_email_wallet_unique" ON "pending_wallet_links" USING btree ("email","wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "ptvs_protocol_chain_idx" ON "protocol_tvl_snapshots" USING btree ("protocol","chain_id");--> statement-breakpoint
CREATE INDEX "ptvs_protocol_idx" ON "protocol_tvl_snapshots" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "ptvs_protocol_computed_idx" ON "protocol_tvl_snapshots" USING btree ("protocol","computed_at");--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seeder_state_last_attempt_idx" ON "seeder_state" USING btree ("last_attempt_at");--> statement-breakpoint
CREATE INDEX "smart_money_recipient_idx" ON "smart_money_snapshot" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "smart_money_ecosystem_idx" ON "smart_money_snapshot" USING btree ("chain_ecosystem");--> statement-breakpoint
CREATE INDEX "stream_annotations_user_idx" ON "stream_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_pnl_user_token_unique" ON "stream_pnl" USING btree ("user_id","token_address");--> statement-breakpoint
CREATE INDEX "stream_purchases_user_token_idx" ON "stream_purchases" USING btree ("user_id","token_address");--> statement-breakpoint
CREATE INDEX "stream_sales_user_token_idx" ON "stream_sales" USING btree ("user_id","token_address");--> statement-breakpoint
CREATE INDEX "stream_tags_user_idx" ON "stream_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_tags_user_tag_idx" ON "stream_tags" USING btree ("user_id","tag");--> statement-breakpoint
CREATE INDEX "tax_report_files_user_generated_idx" ON "tax_report_files" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "tax_report_files_generated_at_idx" ON "tax_report_files" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "token_prices_fetched_at_idx" ON "token_prices_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "vsc_recipient_idx" ON "vesting_streams_cache" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "vsc_recipient_chain_idx" ON "vesting_streams_cache" USING btree ("recipient","chain_id");--> statement-breakpoint
CREATE INDEX "vsc_recipient_protocol_idx" ON "vesting_streams_cache" USING btree ("recipient","protocol");--> statement-breakpoint
CREATE INDEX "vsc_protocol_idx" ON "vesting_streams_cache" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "vsc_protocol_end_time_idx" ON "vesting_streams_cache" USING btree ("protocol","end_time");--> statement-breakpoint
CREATE INDEX "vsc_protocol_first_seen_idx" ON "vesting_streams_cache" USING btree ("protocol","first_seen_at");--> statement-breakpoint
CREATE INDEX "vsc_token_symbol_idx" ON "vesting_streams_cache" USING btree ("token_symbol");--> statement-breakpoint
CREATE INDEX "wallet_searches_wallet_idx" ON "wallet_searches" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "wallet_searches_created_idx" ON "wallet_searches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_searches_user_idx" ON "wallet_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_user_address_idx" ON "wallets" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_chain_token_uq" ON "watchlist" USING btree ("user_id","chain_id","token_address");--> statement-breakpoint
CREATE INDEX "webhook_event_dedup_received_at_idx" ON "webhook_event_dedup" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_subs_api_key_idx" ON "webhook_subscriptions" USING btree ("api_key_id");