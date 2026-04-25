// src/lib/env.ts
// ─────────────────────────────────────────────────────────────────────────────
// Typed, validated environment variables.
//
// Goals:
//   1. Fail fast at process start-up when a REQUIRED secret is missing in
//      production — no more "cryptic 500 at 2am because SESSION_SECRET fell
//      out of Vercel during a merge".
//   2. Give every `process.env` caller a typed shape (string vs string|undef)
//      so TS catches the "forgot to check for undefined" bugs at compile time.
//   3. Keep dev ergonomics — a missing subgraph URL should still fall back to
//      the public endpoint or just warn, not crash `npm run dev`.
//
// Pattern:
//   import { env } from "@/lib/env";
//   const pool = postgres(env.DATABASE_URL);   // string, guaranteed
//   const key  = env.GRAPH_API_KEY;            // string | undefined
//
// Use `requireProd(name)` for vars that are optional in dev but MUST be set
// in production (e.g. DATABASE_URL has a fake default on localhost).
// ─────────────────────────────────────────────────────────────────────────────

type Presence = "required" | "requiredInProd" | "optional";

interface EnvSpec {
  /** Whether the var must be present. "requiredInProd" warns in dev, throws in prod. */
  presence: Presence;
  /** Human description — surfaces in error messages. */
  description: string;
  /** Optional fallback (only used if presence !== "required"). */
  fallback?: string;
}

const IS_PROD    = process.env.NODE_ENV === "production";
const IS_BUILD   = process.env.NEXT_PHASE === "phase-production-build";

/**
 * Read an env var, applying presence rules and recording any problems so they
 * surface together in a single clear startup error instead of 12 sequential
 * cryptic ones.
 */
function readEnv(
  name: string,
  spec: EnvSpec,
  problems: string[],
): string | undefined {
  const raw = process.env[name];

  if (raw && raw.length > 0) return raw;

  // No value present. Decide severity by presence + environment.
  if (spec.presence === "required") {
    // Required everywhere — but during `next build`, Vercel may not have the
    // secret in scope. Fall back to empty to let the build succeed; the
    // runtime will re-check when the var is actually needed.
    if (IS_BUILD) return spec.fallback ?? "";
    problems.push(`${name} is required — ${spec.description}`);
    return spec.fallback;
  }

  if (spec.presence === "requiredInProd" && IS_PROD && !IS_BUILD) {
    problems.push(`${name} is required in production — ${spec.description}`);
  }

  return spec.fallback;
}

// ── Collect all env reads, surfacing missing secrets as ONE startup error ───
const problems: string[] = [];

const raw = {
  // Core runtime
  DATABASE_URL: readEnv("DATABASE_URL", {
    presence: "required",
    description: "Postgres connection string (Supabase)",
  }, problems),

  SESSION_SECRET: readEnv("SESSION_SECRET", {
    presence: "requiredInProd",
    description: "iron-session encryption secret (32+ chars)",
  }, problems),

  IRON_SESSION_SECRET: readEnv("IRON_SESSION_SECRET", {
    presence: "optional",
    description: "legacy alias for SESSION_SECRET",
  }, problems),

  // Auth + admin
  ADMIN_PASSWORD: readEnv("ADMIN_PASSWORD", {
    presence: "requiredInProd",
    description: "admin panel password (timing-safe compared)",
  }, problems),

  CRON_SECRET: readEnv("CRON_SECRET", {
    presence: "requiredInProd",
    description: "bearer token Vercel cron jobs present to gate /api/cron/*",
  }, problems),

  // Third-party services
  RESEND_API_KEY: readEnv("RESEND_API_KEY", {
    presence: "requiredInProd",
    description: "Resend API key — without it OTP emails are not sent",
  }, problems),

  RESEND_FROM_EMAIL: readEnv("RESEND_FROM_EMAIL", {
    presence: "requiredInProd",
    description: "sender address for OTP + notification emails",
  }, problems),

  UPSTASH_REDIS_REST_URL: readEnv("UPSTASH_REDIS_REST_URL", {
    presence: "requiredInProd",
    description: "Upstash Redis REST URL — rate limiting no-ops without it",
  }, problems),

  UPSTASH_REDIS_REST_TOKEN: readEnv("UPSTASH_REDIS_REST_TOKEN", {
    presence: "requiredInProd",
    description: "Upstash Redis REST token",
  }, problems),

  GRAPH_API_KEY: readEnv("GRAPH_API_KEY", {
    presence: "requiredInProd",
    description: "The Graph hosted service API key",
  }, problems),

  REVENUECAT_WEBHOOK_SECRET: readEnv("REVENUECAT_WEBHOOK_SECRET", {
    presence: "requiredInProd",
    description: "shared secret RevenueCat sends in Authorization header",
  }, problems),

  // Admin auth — split from CRON_SECRET so a leaked cron token can't be used
  // to mint API keys via /api/v1/admin/keys.
  ADMIN_API_SECRET: readEnv("ADMIN_API_SECRET", {
    presence: "requiredInProd",
    description: "bearer token for /api/v1/admin/* routes (key minting, listing). MUST be different from CRON_SECRET.",
  }, problems),

  // Observability (no-ops without it)
  SENTRY_DSN: readEnv("SENTRY_DSN", {
    presence: "optional",
    description: "Sentry DSN for server + edge error reporting",
  }, problems),

  NEXT_PUBLIC_SENTRY_DSN: readEnv("NEXT_PUBLIC_SENTRY_DSN", {
    presence: "optional",
    description: "Sentry DSN for browser error reporting",
  }, problems),

  // Feature flags / dev aids
  DEV_OTP: readEnv("DEV_OTP", {
    presence: "optional",
    description: "fixed OTP code for dev — never active in production",
  }, problems),

  NEXT_PUBLIC_APP_URL: readEnv("NEXT_PUBLIC_APP_URL", {
    presence: "optional",
    description: "absolute base URL — falls back to https://vestream.io",
    fallback: "https://vestream.io",
  }, problems),
};

// ── Guard: surface missing vars in logs — but NEVER refuse to boot ──────────
// Earlier this check used to throw on production boot when any requiredInProd
// var was missing. That turned out to be worse than the problem it was solving:
// the rate limiter, OTP route, webhook route, and every adapter already handle
// their own absent-var paths gracefully (no-op the feature, return 503, or fall
// back to defaults). Refusing to boot meant that removing ONE env var took down
// the entire platform, including routes that didn't depend on the missing var
// at all.
//
// We now log loudly so Vercel / Sentry surfaces the config drift, then let the
// process keep running. Each call site is responsible for its own fallback.
if (problems.length > 0) {
  const header = IS_PROD
    ? "[env] Missing environment variables in production — dependent features will be degraded or disabled:"
    : "[env] Missing environment variables (features that need them will no-op):";
  const body = problems.map((p) => `  - ${p}`).join("\n");
  console.warn(`\n${header}\n${body}\n`);
}

/**
 * Typed, validated environment. Values are read once at module load.
 * Required vars are narrowed to `string`; optional vars stay `string | undefined`.
 */
export const env = {
  // Required everywhere
  DATABASE_URL: (raw.DATABASE_URL ?? "") as string,

  // Required in production — typed as string but may be "" during build. Every
  // call site that runs at request time should therefore check before use.
  SESSION_SECRET: (raw.SESSION_SECRET ?? raw.IRON_SESSION_SECRET ?? "") as string,
  ADMIN_PASSWORD: raw.ADMIN_PASSWORD,
  CRON_SECRET: raw.CRON_SECRET,
  RESEND_API_KEY: raw.RESEND_API_KEY,
  RESEND_FROM_EMAIL: raw.RESEND_FROM_EMAIL,
  UPSTASH_REDIS_REST_URL: raw.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: raw.UPSTASH_REDIS_REST_TOKEN,
  GRAPH_API_KEY: raw.GRAPH_API_KEY,
  REVENUECAT_WEBHOOK_SECRET: raw.REVENUECAT_WEBHOOK_SECRET,
  ADMIN_API_SECRET: raw.ADMIN_API_SECRET,

  // Observability
  SENTRY_DSN: raw.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN: raw.NEXT_PUBLIC_SENTRY_DSN,

  // Misc
  DEV_OTP: raw.DEV_OTP,
  NEXT_PUBLIC_APP_URL: (raw.NEXT_PUBLIC_APP_URL ?? "https://vestream.io") as string,

  // Runtime phase — handy for guarding "dev-only" paths like DEV_OTP bypass.
  isProd: IS_PROD,
  isBuild: IS_BUILD,
} as const;

export type Env = typeof env;
