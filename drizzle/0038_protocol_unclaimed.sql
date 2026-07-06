-- Protocol-summary reconciliation (2026-07): add the "unclaimed" signal.
--
-- The protocol hero used to mix scopes: "Streams indexed" (all-time),
-- "Active now" (withdrawn<total, which includes past-due-but-unclaimed
-- locks), and "Tokens/Recipients" (all-time) — so a hero showing
-- "2,005 active / 200 tokens / 2,466 recipients" contradicted its own
-- calendar ("277 upcoming / 67 tokens / 234 wallets"). We now reconcile
-- Active/Tokens/Recipients to the live (still-vesting) scope so they
-- agree with the calendar, keep Streams-indexed as the all-time
-- footprint, and surface the fully-vested-but-not-withdrawn population
-- as its own honest "Unclaimed" stat instead of hiding it inside "Active".
--
-- Idempotent (prod is shipped via raw SQL, not db:migrate).
ALTER TABLE protocol_summaries
  ADD COLUMN IF NOT EXISTS unclaimed_streams integer NOT NULL DEFAULT 0;
