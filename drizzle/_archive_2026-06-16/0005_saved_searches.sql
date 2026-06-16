-- Saved searches for the dashboard explorer.
-- Each row records the URL params of an explorer query the user wants
-- to keep watching, with optional notification alerts on new matches.

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

ALTER TABLE "saved_searches"
	ADD CONSTRAINT "saved_searches_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");
