// sentry.server.config.ts
// Server-side Sentry init (Node runtime routes). Kept intentionally minimal —
// any sensitive payloads (bodies, headers, cookies) are NOT forwarded.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN,

  // Drop request bodies, headers, and cookies from every event. Our auth
  // sends the session cookie on every request — never send that to Sentry.
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
    }
    return event;
  },
});
