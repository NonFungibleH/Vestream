-- Add Stripe billing columns to api_keys.
-- Per-key Pro upgrades: a free-tier key becomes Pro by paying into a
-- Stripe Customer + Subscription. Both IDs are stored on the key row.

ALTER TABLE "api_keys"
  ADD COLUMN "stripe_customer_id" text,
  ADD COLUMN "stripe_subscription_id" text;
