-- 0042: Ponzu presale registry.
--
-- Ponzu is one factory (PonzuV4Recipe) that CLONES a full stack per project.
-- The claim event we care about is emitted by each presale clone, not by the
-- factory, so we cannot watch a single address: we discover presales from the
-- factory's PonzuCrafted event and keep them here, then scan claims across the
-- registry. Same shape as magna_vesters (drizzle/0039).
--
-- Idempotent. Apply with: node scripts/apply-migration.mjs drizzle/0042_ponzu_presales.sql

CREATE TABLE IF NOT EXISTS ponzu_presales (
  chain_id          integer   NOT NULL,
  -- The presale clone. Also the "bottle" ERC-721 collection: a holder's
  -- position IS an NFT minted by this contract.
  presale           text      NOT NULL,
  token             text,
  distributor       text,
  token_symbol      text,
  -- Linear vest length in seconds, from the craft terms (10d / 70d typical).
  vesting_duration  bigint,
  presale_allocation numeric,
  discovered_block  bigint    NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, presale)
);

CREATE INDEX IF NOT EXISTS ponzu_presales_token_idx ON ponzu_presales (chain_id, token);
