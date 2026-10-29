// Repair pass for Solana cache rows whose symbol is a placeholder.
//
// The Solana adapters took symbols from a Jupiter token list and fell back to
// the first four characters of the mint ("CARD…", "2JuP…") when it missed. On
// 2026-10-29 that was every Jupiter Lock row, nearly every Smithii row and
// 2,675 Streamflow rows. The adapters now read symbols from chain
// (src/lib/vesting/solana-token-meta.ts), but writeToCache never lets a
// placeholder replace a stored symbol, and rows that stop changing are not
// rewritten, so existing rows need this one-off pass.
//
// For every DISTINCT Solana mint with a placeholder symbol it reads the mint
// account + Metaplex metadata, then rewrites `token_symbol` and the mirrored
// `stream_data.tokenSymbol`. When the mint's on-chain decimals differ from the
// row's `tokenDecimals` (Jupiter Lock defaulted to 9 when the list missed),
// `stream_data.tokenDecimals` is corrected too; amounts are stored in base
// units, so nothing else changes. Idempotent; mints that still don't resolve
// are left alone.
//
// Usage: npx tsx scripts/repair-solana-token-symbols.ts [--apply]
// RPC: STREAMFLOW_RPC_URL, else the public mainnet endpoint.
import { config } from "dotenv";
config({ path: ".env.local" });

const PLACEHOLDER = `(token_symbol IS NULL OR token_symbol IN ('', 'unknown', 'UNKNOWN', '???') OR token_symbol LIKE '%…')`;

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { Connection } = await import("@solana/web3.js");
  const { resolveSolanaMintMeta } = await import("../src/lib/vesting/solana-token-meta");

  const rows = (await db.execute(sql`
    SELECT token_address AS mint,
           count(*)::int AS n,
           array_agg(DISTINCT protocol) AS protocols,
           array_agg(DISTINCT (stream_data->>'tokenDecimals')::int) AS decimals
    FROM vesting_streams_cache
    WHERE chain_id = 101 AND token_address IS NOT NULL AND ${sql.raw(PLACEHOLDER)}
    GROUP BY 1 ORDER BY n DESC
  `)) as unknown as { mint: string; n: number; protocols: string[]; decimals: (number | null)[] }[];
  const totalRows = rows.reduce((a, r) => a + r.n, 0);
  console.log(`${rows.length} mints / ${totalRows} rows have a placeholder symbol`);

  const url  = process.env.STREAMFLOW_RPC_URL || "https://api.mainnet-beta.solana.com";
  const meta = await resolveSolanaMintMeta(new Connection(url, "confirmed"), rows.map((r) => r.mint));

  let mintsFixed = 0, rowsFixed = 0, decimalsFixed = 0, unresolved = 0;
  const byProtocol = new Map<string, number>();
  const fixes: { mint: string; symbol: string; decimals: number | null }[] = [];
  for (const r of rows) {
    const m = meta.get(r.mint);
    if (!m?.symbol) { unresolved++; continue; }
    const decimalsWrong = m.decimals != null && r.decimals.some((d) => d !== m.decimals);
    mintsFixed++;
    rowsFixed += r.n;
    if (decimalsWrong) decimalsFixed++;
    for (const p of r.protocols) byProtocol.set(p, (byProtocol.get(p) ?? 0) + 1);
    if (mintsFixed <= 15) {
      console.log(
        `  ${r.mint} -> ${m.symbol}${decimalsWrong ? ` (decimals ${r.decimals.join("/")} -> ${m.decimals})` : ""}, ` +
        `${r.n} rows [${r.protocols.join(",")}]`,
      );
    }
    fixes.push({ mint: r.mint, symbol: m.symbol, decimals: m.decimals });
  }

  // Set-based, 500 mints per statement. There is no plain index on
  // token_address, so one UPDATE per mint meant one table scan per mint
  // (~1,900 rows in 10 minutes). The protocol filter lets Postgres use the
  // (protocol, chain_id) index instead of scanning every chain.
  const protocols = [...byProtocol.keys()];
  if (apply) {
    for (let i = 0; i < fixes.length; i += 500) {
      const batch = JSON.stringify(fixes.slice(i, i + 500));
      await db.execute(sql`
        UPDATE vesting_streams_cache c
        SET token_symbol = f.symbol,
            stream_data  = CASE WHEN f.decimals IS NOT NULL
              THEN jsonb_set(jsonb_set(c.stream_data, '{tokenSymbol}', to_jsonb(f.symbol), true),
                             '{tokenDecimals}', to_jsonb(f.decimals), true)
              ELSE jsonb_set(c.stream_data, '{tokenSymbol}', to_jsonb(f.symbol), true)
            END
        FROM jsonb_to_recordset(${batch}::jsonb) AS f(mint text, symbol text, decimals int)
        WHERE c.protocol IN (${sql.join(protocols.map((p) => sql`${p}`), sql`, `)})
          AND c.chain_id = 101
          AND c.token_address = f.mint
          AND ${sql.raw(PLACEHOLDER.replace(/token_symbol/g, "c.token_symbol"))}
      `);
      console.log(`  applied ${Math.min(i + 500, fixes.length)}/${fixes.length} mints`);
    }
  }

  console.log(
    `${apply ? "repaired" : "would repair"} ${mintsFixed} mints / ${rowsFixed} rows ` +
    `(${decimalsFixed} mints with wrong decimals); ${unresolved} mints unresolved; ` +
    `mints by protocol: ${JSON.stringify(Object.fromEntries(byProtocol))}`,
  );
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
