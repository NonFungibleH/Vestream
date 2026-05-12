-- Monthly reset for free-tier push alerts.
-- Shipped 2026-05-12 as part of the pricing simplification rollout.
--
-- Free tier moved from "3 lifetime push alerts" → "10 per calendar month,
-- resets on the 1st." The existing users.push_alerts_sent counter stays
-- as an in-month counter; we add this new column to track which month
-- it belongs to. The checkAndConsumePushCredit helper rolls the counter
-- back to 0 + bumps this timestamp whenever it sees the stored month is
-- behind the current one.
--
-- Nullable on purpose — existing free users get NULL on first read, the
-- helper interprets that as "no month started yet" and initialises on
-- the next consume. No data backfill needed.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "push_alerts_month_start" timestamp;
