-- One-shot backfill of the new explorer-pagination columns on
-- token_vesting_rollups (the hourly refreshTokenRollups maintains them going
-- forward; this fills existing rows so the paginated explorer works on deploy).
WITH meta AS (
  SELECT chain_id,
         lower(token_address) AS tok,
         min(CASE WHEN COALESCE((stream_data->>'nextUnlockTime')::numeric, end_time) >= EXTRACT(EPOCH FROM now())
                  THEN COALESCE((stream_data->>'nextUnlockTime')::numeric, end_time) END)::bigint AS next_unlock,
         array_agg(DISTINCT protocol) AS protocols,
         max(COALESCE((stream_data->>'tokenDecimals')::int, 18))::int AS decimals
  FROM vesting_streams_cache
  WHERE is_fully_vested = false AND chain_id NOT IN (11155111, 84532)
  GROUP BY chain_id, lower(token_address)
)
UPDATE token_vesting_rollups r SET
  next_unlock      = m.next_unlock,
  protocols        = COALESCE(m.protocols, '{}'),
  token_decimals   = COALESCE(m.decimals, 18),
  locked_value_usd = CASE WHEN p.price_usd IS NOT NULL AND p.price_usd > 0
                          THEN (r.total_locked::numeric / power(10, COALESCE(m.decimals, 18))) * p.price_usd::numeric
                          ELSE NULL END,
  market_cap       = p.market_cap::double precision
FROM meta m
LEFT JOIN token_prices_cache p
  ON p.chain_id = m.chain_id AND lower(p.token_address) = m.tok
WHERE r.chain_id = m.chain_id AND lower(r.token_address) = m.tok;
