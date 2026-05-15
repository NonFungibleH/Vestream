#!/usr/bin/env node
// Apply a hand-rolled SQL migration directly via the postgres connection.
// Use this when `drizzle-kit generate` can't run (journal collision at
// 0009 — pre-existing drift that we work around by writing migrations by
// hand and applying them here).
//
// Usage:  node scripts/apply-migration.mjs drizzle/0026_growth_dashboard.sql
//
// Reads DATABASE_URL from .env.local. Idempotent — every statement in our
// hand-rolled SQL uses IF NOT EXISTS so re-runs are safe.

import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

// Use the postgres-js driver (already a project dep — same one drizzle uses)
// so we don't need to install pg separately. `max: 1` keeps it a single
// connection so multi-statement SQL files run in one session.
const client = postgres(url, { max: 1, prepare: false });

console.log(`Applying ${file} ...`);
try {
  await client.unsafe(sql);
  console.log("✓ Migration applied successfully");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
