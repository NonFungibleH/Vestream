// sentry.client.config.ts
// Browser-side Sentry init. No-ops when SENTRY_DSN is unset, so this is safe
// to commit without a DSN configured — errors simply aren't reported until
// NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",

  // Lower this in production once traffic grows — 10% is plenty to spot trends
  // without paying for volume we don't need.
  tracesSampleRate: 0.1,

  // Only capture in production to keep dev noise down. Overridable via env.
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Strip anything that looks like a raw wallet address or email from error
  // messages before sending to Sentry. Belt-and-braces; most of our stack
  // doesn't put these in exception strings anyway.
  beforeSend(event) {
    if (event.message) {
      event.message = event.message
        .replace(/0x[a-fA-F0-9]{40}/g, "0x<redacted>")
        .replace(/[\w.-]+@[\w.-]+\.\w+/g, "<email>");
    }
    return event;
  },
});
