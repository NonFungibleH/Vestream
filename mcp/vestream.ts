#!/usr/bin/env node
/**
 * Vestream MCP Server
 *
 * Exposes Vestream's vesting data API as native tools for AI agents
 * (Claude, Cursor, Windsurf, LangChain, etc.) via the Model Context Protocol.
 *
 * Usage — add to your Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "vestream": {
 *       "command": "npx",
 *       "args": ["-y", "@vestream/mcp"],
 *       "env": { "VESTREAM_API_KEY": "vstr_live_..." }
 *     }
 *   }
 * }
 */

import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                  from "zod";

const BASE_URL = process.env.VESTREAM_API_URL ?? "https://vestream.io/api/v1";
const API_KEY  = process.env.VESTREAM_API_KEY ?? "";

if (!API_KEY) {
  console.error("[vestream-mcp] ERROR: VESTREAM_API_KEY environment variable is required.");
  process.exit(1);
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function vstreamFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept:        "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Vestream API error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

// ─── Shared Zod primitives ───────────────────────────────────────────────────
//
// The previous tool definitions accepted any string for `protocol` and any
// number for `days`, so a misbehaving agent could send `days=999999` or
// `protocol=invalid` and only see a backend rejection — opaque to the LLM.
// Constrain at the MCP layer so the model gets a tight schema and the
// backend never sees out-of-range values.

const PROTOCOL_VALUES = [
  "sablier", "hedgey", "uncx", "unvest", "team-finance",
  "superfluid", "pinksale", "streamflow", "jupiter-lock",
] as const;

// Accept comma-separated lists of the canonical slugs above. We don't try
// to enum-validate the comma-separated string at parse time (Zod can't
// elegantly express that); instead we lower-case + filter at the call
// site so unknown slugs are silently dropped.
const protocolFilter = z.string().optional().describe(
  "Comma-separated protocol filter. Valid values: " + PROTOCOL_VALUES.join(", "),
);

function sanitiseProtocolFilter(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const allow = new Set<string>(PROTOCOL_VALUES);
  const kept = raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => allow.has(s));
  return kept.length > 0 ? kept.join(",") : undefined;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    "vestream",
  version: "1.0.1",
});

// ── Tool: get_wallet_vestings ─────────────────────────────────────────────────

server.tool(
  "get_wallet_vestings",
  "Get all token vesting streams for a wallet across every supported protocol " +
  "and chain (including Solana). EVM protocols: Sablier, Hedgey, UNCX, Unvest, " +
  "Team Finance, Superfluid, PinkSale. Solana protocols: Streamflow, Jupiter Lock. " +
  "EVM chains: Ethereum, BSC, Polygon, Base. Non-EVM chains: Solana. " +
  "Returns normalised stream data: token, amounts locked/claimable/withdrawn, " +
  "schedule dates, cliff time, next unlock, and claim history — identical " +
  "JSON shape regardless of source protocol or ecosystem.",
  {
    address: z.string().describe(
      "Wallet address. EVM: 0x-prefixed hex (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'). " +
      "Solana: base58-encoded pubkey (e.g. '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')"
    ),
    protocol: protocolFilter,
    chain: z.string().optional().describe(
      "Comma-separated chain ID filter, e.g. '1,101,8453'. " +
      "Supported: 1 (Ethereum), 56 (BSC), 137 (Polygon), 8453 (Base), 101 (Solana)"
    ),
    active_only: z.boolean().optional().describe(
      "If true, only return streams that are not yet fully vested (default: false)"
    ),
  },
  async ({ address, protocol, chain, active_only }) => {
    const qs = new URLSearchParams();
    const cleanedProtocol = sanitiseProtocolFilter(protocol);
    if (cleanedProtocol) qs.set("protocol", cleanedProtocol);
    if (chain)           qs.set("chain",    chain);
    if (active_only)     qs.set("active_only", "true");
    const query = qs.toString() ? `?${qs}` : "";

    const data = await vstreamFetch(`/wallet/${address}/vestings${query}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_upcoming_unlocks ────────────────────────────────────────────────

server.tool(
  "get_upcoming_unlocks",
  "Get all upcoming token unlock events for a wallet within a future time window. " +
  "Works for both EVM 0x addresses and Solana base58 pubkeys. Returns cliff " +
  "completions, tranche unlocks, and linear stream endings sorted by date. " +
  "Ideal for forecasting when tokens become available, scheduling claims, or " +
  "building alerts.",
  {
    address: z.string().describe(
      "Wallet address — EVM 0x hex or Solana base58 pubkey"
    ),
    days: z.number().int().min(1).max(365).optional().describe(
      "Lookahead window in days. Default 30, minimum 1, maximum 365."
    ),
    protocol: protocolFilter,
  },
  async ({ address, days, protocol }) => {
    const qs = new URLSearchParams();
    if (days)     qs.set("days",     String(days));
    const cleanedProtocol = sanitiseProtocolFilter(protocol);
    if (cleanedProtocol) qs.set("protocol", cleanedProtocol);
    const query = qs.toString() ? `?${qs}` : "";

    const data = await vstreamFetch(`/wallet/${address}/upcoming-unlocks${query}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_stream ──────────────────────────────────────────────────────────

server.tool(
  "get_stream",
  "Get full details for a single vesting stream by its composite ID. " +
  "Stream IDs follow the format: {protocol}-{chainId}-{nativeId}, " +
  "e.g. 'sablier-1-12345' (EVM) or 'streamflow-101-7xKX...' (Solana). " +
  "Use get_wallet_vestings first to discover stream IDs for a wallet.",
  {
    stream_id: z.string().describe(
      "Composite stream ID in format 'protocol-chainId-nativeId', " +
      "e.g. 'sablier-1-12345', 'uncx-8453-99', 'streamflow-101-7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'"
    ),
  },
  async ({ stream_id }) => {
    const data = await vstreamFetch(`/stream/${stream_id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vestream-mcp] Server running on stdio. Waiting for MCP client...");
}

main().catch((err) => {
  console.error("[vestream-mcp] Fatal error:", err);
  process.exit(1);
});
