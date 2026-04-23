import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// ─── Postgres connection config for Vercel + Supabase ──────────────────────
//
// Serverless invocations on Vercel are single-process per request — there is
// no connection sharing between lambdas at the application layer. `max: 1`
// gives each cold lambda a single connection; the real pooling happens
// upstream in Supabase's PgBouncer (or the direct postgres server).
//
// Supabase offers two pooler modes, each with its own quirks:
//
//   - Session mode (port 5432, a.k.a. "direct"): full Postgres semantics,
//     supports prepared statements. Best for migrations + heavy query
//     workloads.
//   - Transaction mode (port 6543, a.k.a. "pooler"): PgBouncer amortises
//     connections across all clients but does NOT support prepared
//     statements. `postgres-js` defaults to prepared statements, so
//     without `prepare: false` every query fails with:
//        "prepared statement '__postgres_js_1' does not exist"
//
// We auto-detect the transaction pooler by URL shape (port 6543 or the
// `pooler.supabase.com` host) and disable prepared statements when needed.
// This means the same code works whether DATABASE_URL points at the direct
// connection or the transaction pooler.

// Match ONLY the transaction pooler port (6543). The session pooler also
// lives on `pooler.supabase.com` but uses port 5432 and DOES support
// prepared statements — we must not disable them there, or queries that
// bind non-primitive params (Date, bigint) will fail in postgres-js's
// fallback serialization path.
const IS_TXN_POOLER = env.DATABASE_URL.includes(":6543/");

const client = postgres(env.DATABASE_URL, {
  // Single connection per lambda — Supabase handles pooling upstream.
  max: 1,
  // Disable prepared statements when talking to the PgBouncer transaction
  // pooler; otherwise every query errors.
  prepare: !IS_TXN_POOLER,
  // Fail fast if the DB is unreachable — a 10s DNS/TCP hang inside a Vercel
  // function translates directly to a 10s timeout the user sees.
  connect_timeout: 10,
  // Release the connection back to the pool after 20s idle. Vercel kills
  // functions at 5min anyway, but this keeps warm lambdas polite.
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
