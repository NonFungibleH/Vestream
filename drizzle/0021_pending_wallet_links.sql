-- Pending wallet links — web→mobile handoff.
-- Shipped 2026-05-11 to make the /find-vestings → app install flow
-- frictionless. When a user submits their email on the web after running a
-- wallet scan, we store the (email, wallet) pair here. When the same user
-- later signs into the mobile app with OTP using that email, the
-- /api/mobile/auth/verify-otp handler auto-claims every matching pending
-- row and inserts the wallet(s) into their wallets table.
--
-- No deferred-deep-link service required — the email is the attribution
-- vector. Idempotent: returning users (already have a Vestream account
-- with that email) get the new wallet(s) merged in the same way.
--
-- Rows have a 30-day TTL; an existing daily cleanup cron sweeps expired
-- unclaimed rows. Claimed rows are kept indefinitely for the analytics
-- funnel (search → claim conversion).

CREATE TABLE IF NOT EXISTS "pending_wallet_links" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased before insert so dedupe + claim stay case-insensitive.
  "email"          text NOT NULL,
  "wallet_address" text NOT NULL,
  -- Optional user-supplied label captured at search time.
  "label"          text,
  -- Optional chain narrowing. NULL = scan all chains (matches the
  -- wallets table's semantics).
  "chain_ids"      jsonb,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  -- Set when the wallet has been added to a user's account via OTP verify.
  -- Null = still pending.
  "claimed_at"     timestamp,
  -- 30-day TTL. Daily cleanup cron deletes WHERE expires_at < NOW()
  -- AND claimed_at IS NULL.
  "expires_at"     timestamp NOT NULL
);

-- Hot path: "claim every unclaimed pending row for email X" on OTP verify.
CREATE INDEX IF NOT EXISTS "pending_wallet_links_email_idx"
  ON "pending_wallet_links" ("email");

-- Dedup: re-searching the same wallet from the same email is a no-op on
-- the schema side; the API extends expires_at on conflict.
CREATE UNIQUE INDEX IF NOT EXISTS "pending_wallet_links_email_wallet_unique"
  ON "pending_wallet_links" ("email", "wallet_address");
