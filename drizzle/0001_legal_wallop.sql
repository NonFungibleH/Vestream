ALTER TABLE "users" ADD COLUMN "push_alerts_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_user_address_idx" ON "wallets" USING btree ("user_id","address");