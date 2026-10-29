// src/lib/vesting/solana-token-meta.ts
// ─────────────────────────────────────────────────────────────────────────────
// Symbol + decimals for Solana SPL mints, read from chain.
//
// Why on-chain and not Jupiter: every Solana adapter used to take symbols from
// a Jupiter token list and fall back to `${mint.slice(0, 4)}…`. The list only
// covers tokens Jupiter has tagged, which is a small share of what vesting
// tools lock, and the "verified" list Jupiter Lock and Smithii read stopped
// resolving anything at all. On 2026-10-29 every one of the 60,079 Jupiter Lock
// cache rows, 2,052 of 2,076 Smithii rows and 2,675 Streamflow rows carried a
// truncated mint ("CARD…", "2JuP…") as their symbol. Jupiter Lock also took
// DECIMALS from that list and defaulted to 9 when it missed.
//
// Sources, in order:
//   1. The mint account itself (one getMultipleAccounts per 100 mints):
//      decimals at byte 44 of the SPL Mint layout, and for Token-2022 mints the
//      symbol from the TokenMetadata extension when it is present.
//   2. The Metaplex metadata PDA (one getMultipleAccounts per 100 mints):
//      covers classic SPL tokens, pump.fun launches included.
//   3. Jupiter's search API for whatever is still missing, capped, since it is
//      one HTTP request per 50 mints and rate-limited.
// A mint that resolves through none of these gets `symbol: null`; callers keep
// the truncated-mint display fallback (`solanaSymbolFallback`).
// ─────────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from "@solana/web3.js";
import { mapBounded } from "./rpc";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const METAPLEX_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// getMultipleAccounts takes up to 100 keys. One request in flight with a 250ms
// gap is ~4 req/s, inside the public mainnet endpoint's 40-per-10s per-method
// limit and Helius free CU/s.
const MULTI_ACCOUNT_CHUNK = 100;
const RPC_CONCURRENCY     = 1;
const RPC_DELAY_MS        = 250;

const JUPITER_SEARCH_URL  = "https://lite-api.jup.ag/tokens/v2/search";
const JUPITER_BATCH_SIZE  = 50;
const JUPITER_MAX_MINTS   = 1_000;

// SPL Mint: mint_authority COption<Pubkey>(36) + supply u64(8) → decimals u8 @44.
const MINT_DECIMALS_OFFSET = 44;
// Token-2022: base mint padded to 165 bytes, then the account-type byte, then TLV.
const TOKEN_2022_TLV_START = 166;
const TOKEN_2022_EXT_TOKEN_METADATA = 19;

export interface SolanaMintMeta {
  symbol:   string | null;
  decimals: number | null;
}

/** Display fallback for a mint with no resolvable symbol. */
export function solanaSymbolFallback(mint: string): string {
  return `${mint.slice(0, 4)}…`;
}

/** Strip the NUL padding Metaplex writes into fixed-width strings. */
function cleanSymbol(raw: string): string | null {
  const s = raw.replace(/\0/g, "").trim();
  return s.length > 0 && s.length <= 32 ? s : null;
}

/** Borsh string at `offset`: u32 LE length + UTF-8 bytes. Returns the string
 *  and the offset just past it, or null if it runs off the buffer. */
function readBorshString(data: Buffer, offset: number): { value: string; next: number } | null {
  if (offset + 4 > data.length) return null;
  const len = data.readUInt32LE(offset);
  const start = offset + 4;
  if (len > 200 || start + len > data.length) return null;
  return { value: data.subarray(start, start + len).toString("utf8"), next: start + len };
}

/** Token-2022 TokenMetadata extension: update_authority(32) mint(32) name symbol … */
function readToken2022Symbol(data: Buffer): string | null {
  let off = TOKEN_2022_TLV_START;
  while (off + 4 <= data.length) {
    const type = data.readUInt16LE(off);
    const len  = data.readUInt16LE(off + 2);
    const body = off + 4;
    if (type === TOKEN_2022_EXT_TOKEN_METADATA) {
      const name = readBorshString(data, body + 64);
      if (!name) return null;
      const symbol = readBorshString(data, name.next);
      return symbol ? cleanSymbol(symbol.value) : null;
    }
    if (type === 0 && len === 0) return null; // uninitialised padding
    off = body + len;
  }
  return null;
}

/** Metaplex Metadata: key(1) update_authority(32) mint(32) name symbol … */
function readMetaplexSymbol(data: Buffer): string | null {
  const name = readBorshString(data, 65);
  if (!name) return null;
  const symbol = readBorshString(data, name.next);
  return symbol ? cleanSymbol(symbol.value) : null;
}

async function getMultipleInChunks(
  conn: Connection,
  keys: PublicKey[],
  onChunk: (keys: PublicKey[], infos: ({ data: Buffer; owner: PublicKey } | null)[]) => void,
): Promise<number> {
  const chunks: PublicKey[][] = [];
  for (let i = 0; i < keys.length; i += MULTI_ACCOUNT_CHUNK) {
    chunks.push(keys.slice(i, i + MULTI_ACCOUNT_CHUNK));
  }
  const results = await mapBounded(chunks, RPC_CONCURRENCY, async (chunk) => {
    let infos;
    try {
      infos = await conn.getMultipleAccountsInfo(chunk, "confirmed");
    } catch {
      // One retry after a pause: a lone failed chunk on the public endpoint
      // otherwise leaves 100 mints without decimals for the whole run.
      await new Promise((r) => setTimeout(r, 2_000));
      infos = await conn.getMultipleAccountsInfo(chunk, "confirmed");
    }
    onChunk(chunk, infos as ({ data: Buffer; owner: PublicKey } | null)[]);
  }, RPC_DELAY_MS);
  return results.filter((r) => r.status === "rejected").length;
}

async function lookupJupiter(mints: string[]): Promise<Map<string, { symbol: string; decimals: number }>> {
  const out = new Map<string, { symbol: string; decimals: number }>();
  for (let i = 0; i < mints.length; i += JUPITER_BATCH_SIZE) {
    const batch = mints.slice(i, i + JUPITER_BATCH_SIZE);
    try {
      const res = await fetch(`${JUPITER_SEARCH_URL}?query=${batch.join(",")}`, {
        next: { revalidate: 1800 },
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const tokens = (await res.json()) as { id: string; symbol: string; decimals: number }[];
      for (const t of tokens) {
        if (t.id && t.symbol) out.set(t.id, { symbol: t.symbol, decimals: t.decimals });
      }
    } catch (err) {
      console.error("[solana-token-meta] Jupiter search batch failed:", err);
    }
  }
  return out;
}

/**
 * Resolve symbol + decimals for every mint. Never throws: a chunk that fails
 * leaves its mints unresolved (null fields) rather than sinking the batch.
 */
export async function resolveSolanaMintMeta(
  conn:  Connection,
  mints: string[],
  /** Already-known metadata (e.g. from the cache); these mints skip the RPC. */
  known?: Map<string, { symbol: string; decimals: number }>,
): Promise<Map<string, SolanaMintMeta>> {
  const out = new Map<string, SolanaMintMeta>();
  const keys: PublicKey[] = [];
  let reused = 0;
  for (const m of new Set(mints)) {
    const k = known?.get(m);
    if (k) {
      out.set(m, { symbol: k.symbol, decimals: k.decimals });
      reused++;
      continue;
    }
    out.set(m, { symbol: null, decimals: null });
    try { keys.push(new PublicKey(m)); } catch { /* malformed mint, stays null */ }
  }

  // 1. Mint accounts: decimals, and Token-2022 metadata-extension symbols.
  const mintErrors = await getMultipleInChunks(conn, keys, (chunk, infos) => {
    chunk.forEach((k, i) => {
      const info = infos[i];
      if (!info || info.data.length <= MINT_DECIMALS_OFFSET) return;
      const meta = out.get(k.toBase58())!;
      meta.decimals = info.data[MINT_DECIMALS_OFFSET];
      if (info.owner.toBase58() === TOKEN_2022_PROGRAM_ID) {
        meta.symbol = readToken2022Symbol(Buffer.from(info.data));
      }
    });
  });

  // 2. Metaplex metadata PDAs for everything still without a symbol.
  const needMetaplex = keys.filter((k) => out.get(k.toBase58())!.symbol === null);
  const pdas = needMetaplex.map((k) => PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX_METADATA_PROGRAM_ID.toBuffer(), k.toBuffer()],
    METAPLEX_METADATA_PROGRAM_ID,
  )[0]);
  const pdaToMint = new Map(pdas.map((p, i) => [p.toBase58(), needMetaplex[i].toBase58()]));
  const metaErrors = await getMultipleInChunks(conn, pdas, (chunk, infos) => {
    chunk.forEach((p, i) => {
      const info = infos[i];
      if (!info) return;
      const symbol = readMetaplexSymbol(Buffer.from(info.data));
      if (symbol) out.get(pdaToMint.get(p.toBase58())!)!.symbol = symbol;
    });
  });

  // 3. Jupiter for the remainder, capped.
  const stillMissing = [...out.entries()]
    .filter(([, m]) => m.symbol === null)
    .map(([mint]) => mint);
  const jupiter = await lookupJupiter(stillMissing.slice(0, JUPITER_MAX_MINTS));
  for (const [mint, j] of jupiter) {
    const meta = out.get(mint);
    if (!meta) continue;
    meta.symbol ??= j.symbol;
    meta.decimals ??= j.decimals;
  }

  const unresolved = [...out.values()].filter((m) => m.symbol === null).length;
  console.log(
    `[solana-token-meta] ${out.size} mints (${reused} known, ${keys.length} read from chain): ` +
    `${out.size - unresolved} with symbols, ${unresolved} unresolved ` +
    `(chunk errors: mint ${mintErrors}, metaplex ${metaErrors}; jupiter filled ${jupiter.size})`,
  );
  return out;
}
