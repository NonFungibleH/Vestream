-- NOTE (2026-09-14): renumbered on merge. This file was written as 0039 on
-- feat/unlock-basis-tax in July while main independently used the same number.
-- Already applied to production (table/column verified present), so this is a
-- no-op re-run — it is idempotent either way.
-- 0039_users_tax_basis.sql
-- Per-user tax basis for vesting income: "claim" (default) or "unlock" (accrual).
-- Idempotent — safe to re-run; the physical DB is the source of truth (the
-- drizzle journal is archived).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_basis" text NOT NULL DEFAULT 'claim';
