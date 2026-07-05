-- 0039_users_tax_basis.sql
-- Per-user tax basis for vesting income: "claim" (default) or "unlock" (accrual).
-- Idempotent — safe to re-run; the physical DB is the source of truth (the
-- drizzle journal is archived).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_basis" text NOT NULL DEFAULT 'claim';
