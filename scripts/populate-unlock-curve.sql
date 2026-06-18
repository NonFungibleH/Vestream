-- One-shot backfill of token_vesting_rollups.unlock_curve. Mirrors the curve
-- computation folded into refreshTokenRollups() (the cron keeps it fresh).
-- 12-point cumulative vested fraction (0–100) across each token's span.
WITH spans AS (
  SELECT chain_id, lower(token_address) AS tok,
         min((stream_data->>'startTime')::numeric) AS fs,
         max(end_time)::numeric AS le
  FROM vesting_streams_cache
  WHERE is_fully_vested = false AND chain_id NOT IN (11155111, 84532)
  GROUP BY 1, 2
),
curve AS (
  SELECT s.chain_id, s.tok, p.k,
    round(100 * SUM(
      (v.stream_data->>'totalAmount')::numeric *
      CASE WHEN (s.fs + (s.le - s.fs) * p.k / 11.0) < COALESCE((v.stream_data->>'cliffTime')::numeric, (v.stream_data->>'startTime')::numeric) THEN 0
           ELSE GREATEST(0, LEAST(1, ((s.fs + (s.le - s.fs) * p.k / 11.0) - (v.stream_data->>'startTime')::numeric) / NULLIF(v.end_time - (v.stream_data->>'startTime')::numeric, 0))) END
    ) / NULLIF(SUM((v.stream_data->>'totalAmount')::numeric), 0)) AS frac
  FROM spans s
  JOIN vesting_streams_cache v ON v.chain_id = s.chain_id AND lower(v.token_address) = s.tok AND v.is_fully_vested = false
  CROSS JOIN generate_series(0, 11) AS p(k)
  GROUP BY s.chain_id, s.tok, p.k, s.fs, s.le
),
agg AS (
  SELECT chain_id, tok, string_agg(COALESCE(frac, 0)::text, ',' ORDER BY k) AS curve
  FROM curve GROUP BY chain_id, tok
)
UPDATE token_vesting_rollups r
SET unlock_curve = agg.curve
FROM agg
WHERE r.chain_id = agg.chain_id AND lower(r.token_address) = agg.tok;
