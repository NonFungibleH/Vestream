import * as Sentry from "@sentry/nextjs";

// Report a cron / background-job failure to BOTH the logs AND Sentry.
// ─────────────────────────────────────────────────────────────────────────────
// July 2026 audit (CTO reliability #1): every cron handler caught its own
// errors and only `console.error`'d them, so Sentry — wired for UNHANDLED
// errors via instrumentation.ts:onRequestError — never saw the failures that
// matter. A protocol's seed silently dying, a TVL walker breaking, an ingestor
// throwing: all invisible until someone read /status by hand (a 45-day-stale
// Jupiter Lock seed is what proved that loop doesn't happen).
//
// Route every caught cron/background error through this helper so it lands in
// Sentry with a `cron` tag you can alert on. captureException is a safe no-op
// when SENTRY_DSN is unset, so this never throws or slows the job down.
// ─────────────────────────────────────────────────────────────────────────────
export function reportCronError(
  context: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.error(`[cron/${context}]`, err, extra ?? "");
  try {
    Sentry.captureException(err, {
      tags:  { area: "cron", cron: context },
      extra: { context, ...extra },
    });
  } catch {
    // Sentry not initialised (no DSN) — the console.error above already ran.
  }
}
