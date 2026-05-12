-- Webhook event dedup — replay protection for external webhooks.
-- Shipped 2026-05-12 for the audit hardening pass.
--
-- Both RevenueCat and Stripe deliver events at-least-once: network
-- hiccups, signature-verification retries, or operator-triggered
-- "resend event" actions can cause the same payload to land at our
-- endpoint twice. Without dedup, a CANCELLATION event redelivered
-- after an UNCANCELLATION would silently downgrade a paying user.
--
-- The fix: each webhook handler tries to INSERT (event_id, source)
-- with ON CONFLICT DO NOTHING. If RETURNING comes back empty, the
-- event was already processed — return 200 OK without side effects.
--
-- Rows are kept for ~30 days for forensic / replay-window coverage,
-- then swept by the cleanup-pending-links cron (extended in the same
-- ship to handle this table too).

CREATE TABLE IF NOT EXISTS "webhook_event_dedup" (
  -- Composite primary key keeps the door open to two providers
  -- legitimately reusing the same event ID format.
  "event_id"    text NOT NULL,
  "source"      text NOT NULL,  -- "revenuecat" | "stripe"
  "received_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_event_dedup_pk" PRIMARY KEY ("event_id", "source")
);

-- Cleanup-cron's hot query: "delete everything older than N days".
CREATE INDEX IF NOT EXISTS "webhook_event_dedup_received_at_idx"
  ON "webhook_event_dedup" ("received_at");
