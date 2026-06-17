-- One-shot populate of token_vesting_rollups from current cache state.
-- Mirrors refreshTokenRollups() in src/lib/vesting/token-rollups.ts (the
-- hourly cron does the ongoing refresh). Single INSERT…SELECT so it also
-- serves as a cross-check that the two-pass aggregation lines up.
WITH per_recipient AS (
  SELECT chain_id,
         lower(token_address) AS tok,
         lower(recipient)     AS r,
         COALESCE(SUM((stream_data->>'lockedAmount')::numeric), 0) AS rl
  FROM vesting_streams_cache
  WHERE is_fully_vested = false
    AND chain_id NOT IN (11155111, 84532)
  GROUP BY chain_id, lower(token_address), lower(recipient)
),
conc AS (
  SELECT chain_id, tok,
         SUM(rl) AS total,
         MAX(rl) AS top,
         count(*)::int AS wallets
  FROM per_recipient
  GROUP BY chain_id, tok
),
meta AS (
  SELECT chain_id,
         lower(token_address) AS tok,
         max(token_symbol)    AS symbol,
         count(*)::int        AS streams,
         count(distinct (
           protocol || '|' ||
           CASE WHEN stream_data->>'shape' = 'steps' THEN 'steps' ELSE 'linear' END || '|' ||
           GREATEST(0, ROUND((COALESCE((stream_data->>'cliffTime')::numeric, (stream_data->>'startTime')::numeric) - (stream_data->>'startTime')::numeric) / 86400))::int || '|' ||
           GREATEST(0, ROUND((end_time - (stream_data->>'startTime')::numeric) / 86400))::int
         ))::int AS rounds,
         min((stream_data->>'startTime')::numeric)::bigint AS first_start,
         max(end_time)::bigint AS last_end,
         bool_or((COALESCE((stream_data->>'cliffTime')::numeric, (stream_data->>'startTime')::numeric) - (stream_data->>'startTime')::numeric) > 86400) AS has_cliff
  FROM vesting_streams_cache
  WHERE is_fully_vested = false
    AND chain_id NOT IN (11155111, 84532)
  GROUP BY chain_id, lower(token_address)
)
INSERT INTO token_vesting_rollups (
  chain_id, token_address, token_symbol, total_locked, top_holder_share,
  wallet_count, round_count, stream_count, first_start, last_end, has_cliff, computed_at
)
SELECT m.chain_id, m.tok, m.symbol,
       COALESCE(c.total, 0)::text,
       CASE WHEN c.total > 0 THEN (c.top / c.total)::double precision ELSE NULL END,
       COALESCE(c.wallets, 0), m.rounds, m.streams, m.first_start, m.last_end, m.has_cliff, now()
FROM meta m
LEFT JOIN conc c ON c.chain_id = m.chain_id AND c.tok = m.tok
ON CONFLICT (chain_id, token_address) DO UPDATE SET
  token_symbol     = excluded.token_symbol,
  total_locked     = excluded.total_locked,
  top_holder_share = excluded.top_holder_share,
  wallet_count     = excluded.wallet_count,
  round_count      = excluded.round_count,
  stream_count     = excluded.stream_count,
  first_start      = excluded.first_start,
  last_end         = excluded.last_end,
  has_cliff        = excluded.has_cliff,
  computed_at      = excluded.computed_at;
