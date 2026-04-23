// sentry.edge.config.ts
// Edge runtime Sentry init (middleware + any route with `runtime = "edge"`).
// Must be separate from the Node config — edge lacks Node built-ins.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN,
});
