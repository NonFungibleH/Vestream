// src/lib/loops.ts
// ─────────────────────────────────────────────────────────────────────────────
// Loops (loops.so) integration — lifecycle email automation.
//
// Activated 2026-05-22. Loops replaces ad-hoc Resend sends for any email
// that benefits from sequencing, audience filtering, or A/B testing.
// Transactional emails (OTP codes, password resets) stay on Resend
// because Loops' free tier doesn't optimise for sub-second send latency.
//
// ── Split of responsibility ─────────────────────────────────────────────────
//   Resend (lib/notifications/email.ts, /api/mobile/auth/email)
//     - OTP codes
//     - Per-unlock push fallback emails (Pro tier)
//
//   Loops (this file)
//     - find_vestings_saved      → E3 (welcome + app download CTA)
//     - signup_completed         → future onboarding sequence
//     - wallet_scanned           → future in-app activation flow
//     - first_push_tapped        → R1 (30-min check-in)
//     - wallet_add_blocked_cap   → M1 (free-cap upgrade prompt)
//     - push_budget_80_percent   → M2 (budget warning)
//     - app_first_open           → future activation signal
//
// ── Env vars ────────────────────────────────────────────────────────────────
//   LOOPS_API_KEY — required to fire events. When unset, sendLoopsEvent
//     short-circuits and logs once. Designed so a missing key during local
//     dev doesn't block development; the cron / API route paths still work.
//
// ── API reference ───────────────────────────────────────────────────────────
//   POST https://app.loops.so/api/v1/events/send
//   Header: Authorization: Bearer <api_key>
//   Body:   { email, eventName, eventProperties?, contactProperties? }
//
//   The first time Loops sees an email, it auto-creates a contact. Subsequent
//   events on the same email attach to that contact. No need to call
//   "create contact" separately.
//
// ── Safety properties ──────────────────────────────────────────────────────
//   - Fire-and-forget by default. Never throws into the caller.
//   - All callers should void-wrap the call so unhandled rejections don't
//     surface (Next.js logs them noisily).
//   - 5-second timeout via AbortSignal so a Loops outage can't hang an API
//     route's response.
//
// ─────────────────────────────────────────────────────────────────────────────

const LOOPS_EVENTS_URL = "https://app.loops.so/api/v1/events/send";

type ScalarProperty = string | number | boolean | null;

interface SendLoopsEventArgs {
  /** The contact's email — Loops uses this as the primary key. Required. */
  email: string;
  /** snake_case event name. Must match the trigger configured in Loops UI. */
  eventName: string;
  /** Event-specific properties referenced via {{eventProperties.X}} in templates. */
  eventProperties?: Record<string, ScalarProperty>;
  /** Contact-level properties (firstName, tier, etc.) referenced via {{contact.X}}. */
  contactProperties?: Record<string, ScalarProperty>;
  /** Optional Vestream user id; surfaces in Loops dashboards for cross-reference. */
  userId?: string;
}

/**
 * Fire a Loops event. Returns void — always — even on failure. Errors are
 * logged so we can spot misconfigured events in production logs, but they
 * never propagate to the caller because the user-facing operation (signup,
 * wallet save, etc.) has already succeeded by the time we're sending.
 *
 * Always invoke via `void sendLoopsEvent(...)` from API routes so the
 * promise doesn't surface as unhandled in Next.js logs.
 */
export async function sendLoopsEvent(args: SendLoopsEventArgs): Promise<void> {
  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) {
    // Dev / staging without the key — log once but don't error. The Resend
    // fallback path (where applicable) handles email delivery instead.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[loops] LOOPS_API_KEY not set — skipping event '${args.eventName}'`);
    }
    return;
  }

  // 5-second timeout. Loops' API is fast (typically <200ms) but a network
  // hang shouldn't block the API route's response — every caller has
  // already saved the user-relevant state by the time this fires.
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  try {
    const payload: Record<string, unknown> = {
      email:     args.email.toLowerCase().trim(),
      eventName: args.eventName,
    };
    if (args.userId)            payload.userId            = args.userId;
    if (args.eventProperties)   payload.eventProperties   = args.eventProperties;
    if (args.contactProperties) payload.contactProperties = args.contactProperties;

    const res = await fetch(LOOPS_EVENTS_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      console.error(
        `[loops] event '${args.eventName}' failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
      );
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[loops] event '${args.eventName}' fired for ${args.email}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[loops] event '${args.eventName}' timed out after 5s`);
    } else {
      console.error(`[loops] event '${args.eventName}' threw:`, err);
    }
  } finally {
    clearTimeout(timeout);
  }
}
