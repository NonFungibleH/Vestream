-- Migration 0015 — users.audience_category
--
-- Phase 2 of the worker-pivot strategy. Captures the primary audience
-- the user identifies with so the dashboard, onboarding flow, tax
-- exports, and protocol recommendations can branch off it.
--
--   "investor" → here for cliff/unlock vesting (TGE allocations,
--                 SAFTs, team grants, airdrops). Tax: capital asset.
--   "worker"   → here for streaming income (DAO contributor pay,
--                 stablecoin salary, grant streams). Tax: ordinary
--                 income at FMV-on-receipt.
--   "both"     → power users with both vesting + payroll positions.
--                 Dashboard shows both categories side by side; tax
--                 export ships as a multi-sheet zip.
--
-- Nullable so existing users (pre-pivot) read as "audience unknown" and
-- the UI falls back to the legacy investor-flavoured copy until they
-- next visit the settings or onboarding screen. No backfill — letting
-- the field stay null is intentional; we want the user to self-identify
-- rather than guess from their userType.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "audience_category" text;
