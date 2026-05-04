import type { Config } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// ─── Pooler-port guard ───────────────────────────────────────────────────────
// drizzle-kit migrate uses multi-statement transactions which the Supabase
// transaction pooler (port 6543) does NOT support. Hitting it means
// migrations silently no-op and __drizzle_migrations stays empty — the
// failure mode that bit prod on May 4 2026 (six migrations went undetectably
// unapplied: 0009 claim_events, 0013 stream_annotations, 0014 stream_tags +
// calendar_tokens, 0015 audience_category, 0016 status_summary).
//
// If your DATABASE_URL points at the pooler and you have NOT set a separate
// DATABASE_URL_DIRECT, this exits LOUDLY rather than letting drizzle-kit
// pretend everything is fine. To run migrations:
//   - Add DATABASE_URL_DIRECT to .env.local pointing at the session-mode
//     pooler (port 5432) or the direct DB connection, OR
//   - Apply migrations directly via `psql -f drizzle/<file>.sql` (the
//     recovery path used on May 4 2026).
const candidate = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "";
if (!candidate) {
  console.error("[drizzle.config] No DATABASE_URL_DIRECT or DATABASE_URL set in .env.local");
  process.exit(1);
}
if (!process.env.DATABASE_URL_DIRECT && /pooler\.supabase\.com:6543/.test(candidate)) {
  console.error(
    "[drizzle.config] DATABASE_URL points at the Supabase TRANSACTION pooler (port 6543).\n" +
    "  drizzle-kit migrate will SILENTLY DO NOTHING against this endpoint.\n" +
    "  Fix: set DATABASE_URL_DIRECT in .env.local to either:\n" +
    "    - the session-mode pooler URL (same host, port 5432), or\n" +
    "    - the direct DB connection from Supabase → Settings → Database.\n" +
    "  Or apply migrations manually: psql \"$DATABASE_URL_DIRECT\" -f drizzle/<file>.sql",
  );
  process.exit(1);
}

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: candidate },
} satisfies Config;
