-- 0049_claim_events_wallet_scoped.sql
-- ---------------------------------------------------------------------------
-- Lets a claim exist for a wallet that has no account behind it.
--
-- Why: claim ingestion has only ever run for PAID users with linked wallets,
-- which is why claim_events holds 41 rows platform-wide. The tax product needs
-- to show a first-time visitor their own claim history before they pay, and
-- there is nowhere to put those rows while user_id is NOT NULL.
--
-- This is safe because the table was already wallet-keyed, not user-keyed. The
-- dedup index is (chain_id, tx_hash, recipient, token_address) — no user_id in
-- it — so one on-chain claim was always one row regardless of who was looking.
-- user_id is an owner tag, not part of identity.
--
-- That same asymmetry is a live bug this unblocks: inserts conflict on a key
-- without user_id while every read filters BY user_id, so when a second user
-- tracked a wallet the first user already had, their insert no-opped and their
-- history came back empty. Reads move to matching on recipient.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE claim_events ALTER COLUMN user_id DROP NOT NULL;

-- Reads are now "claims for these wallet addresses, newest first".
CREATE INDEX IF NOT EXISTS claim_events_recipient_claimed_idx
  ON claim_events (lower(recipient), claimed_at DESC);
