-- 0040: Web unlock-alert subscriptions.
--
-- The product's promise is "we tell you the moment your tokens unlock", but
-- until now we only did that for people who had installed the mobile app and
-- signed in. A visitor who scanned a wallet on /find-vestings handed over an
-- email and received nothing: the address went into pending_wallet_links
-- purely as an install-attribution token.
--
-- This table makes the web able to deliver the actual promise. One row per
-- (email, wallet) someone asked to be alerted about. No account, no wallet
-- connection, no install.
--
-- Idempotent — safe to re-run.
-- Apply with: node scripts/apply-migration.mjs drizzle/0040_wallet_alert_subs.sql

CREATE TABLE IF NOT EXISTS wallet_alert_subscriptions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased before insert so dedupe stays case-insensitive.
  email              text        NOT NULL,
  -- NOT lowercased: Solana addresses are base58 and case-sensitive.
  -- normaliseAddress() handles the EVM/Solana split before insert.
  wallet_address     text        NOT NULL,
  -- Hours before an unlock to send. Matches notification_preferences semantics.
  hours_before       integer     NOT NULL DEFAULT 24,
  -- Single-use token in every email's unsubscribe link. Random, not derived
  -- from the email, so a link cannot be guessed from an address.
  unsubscribe_token  text        NOT NULL,
  -- Set when the recipient unsubscribes. Rows are kept rather than deleted so
  -- a later re-subscribe cannot be used to spam someone who opted out.
  unsubscribed_at    timestamp,
  last_sent_at       timestamp,
  sent_count         integer     NOT NULL DEFAULT 0,
  created_at         timestamp   NOT NULL DEFAULT now()
);

-- One subscription per (email, wallet). Re-subscribing updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_alert_subs_email_wallet_idx
  ON wallet_alert_subscriptions (lower(email), wallet_address);

-- The notify cron's scan: active subscriptions only.
CREATE INDEX IF NOT EXISTS wallet_alert_subs_active_idx
  ON wallet_alert_subscriptions (unsubscribed_at)
  WHERE unsubscribed_at IS NULL;

-- Unsubscribe-link lookup.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_alert_subs_token_idx
  ON wallet_alert_subscriptions (unsubscribe_token);
