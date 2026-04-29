-- Migration 0012 — token-page lookup index.
--
-- Problem: /token/[chainId]/[address] runs four SELECTs against
-- `vesting_streams_cache` filtered by `chain_id = X AND lower(token_address) = Y`.
-- The table has only `recipient`-keyed indexes (vsc_recipient_idx,
-- vsc_recipient_chain_idx, vsc_recipient_protocol_idx). With ~62k rows on
-- production, every query did a full sequential scan — and four of them
-- run in parallel via Promise.all on every request. That's the "super
-- slow / empty page" symptom: each scan was ~hundreds-of-ms to seconds
-- on Supabase's free tier, and a transient timeout on any one of them
-- cascaded into a blank render.
--
-- Fix: a functional index on `(chain_id, lower(token_address))`. The
-- functional form is required because the WHERE clause uses `lower(...)`
-- defensively (different adapters store addresses with different casing).
-- A plain index on `token_address` wouldn't be used.
--
-- 62k rows is small enough that a non-CONCURRENTLY build is fine — index
-- creation is sub-second and the brief AccessExclusiveLock on the table
-- won't be noticed by users. (If this table grows past a few million
-- rows in future, switch to CREATE INDEX CONCURRENTLY and run it
-- manually outside the migration runner — drizzle-kit wraps migrations
-- in a transaction by default and CONCURRENTLY cannot run in one.)

CREATE INDEX IF NOT EXISTS "vsc_chain_token_lower_idx"
  ON "vesting_streams_cache" ("chain_id", LOWER("token_address"));
