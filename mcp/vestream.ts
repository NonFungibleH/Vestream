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

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    "vestream",
  version: "1.0.0",
});

// ── Tool: get_wallet_vestings ─────────────────────────────────────────────────

server.tool(
  "get_wallet_vestings",
  "Get all token vesting streams for an EVM wallet address across all supported " +
  "protocols (Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, PinkSale) " +
  "and chains (Ethereum, BSC, Polygon, Base). Returns normalised stream data: " +
  "token, amounts locked/claimable/withdrawn, schedule dates, cliff time, next " +
  "unlock, and claim history.",
  {
    address: z.string().describe(
      "EVM wallet address in 0x format, e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'"
    ),
    protocol: z.string().optional().describe(
      "Comma-separated protocol filter, e.g. 'sablier,uncx'. " +
      "Valid values: sablier, hedgey, uncx, unvest, team-finance, superfluid, pinksale"
    ),
    chain: z.string().optional().describe(
      "Comma-separated chain ID filter, e.g. '1,137,8453'. " +
      "Supported: 1 (Ethereum), 56 (BSC), 137 (Polygon), 8453 (Base)"
    ),
    active_only: z.boolean().optional().describe(
      "If true, only return streams that are not yet fully vested (default: false)"
    ),
  },
  async ({ address, protocol, chain, active_only }) => {
    const qs = new URLSearchParams();
    if (protocol)    qs.set("protocol",    protocol);
    if (chain)       qs.set("chain",       chain);
    if (active_only) qs.set("active_only", "true");
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
  "Get all upcoming token unlock events for an EVM wallet within a future time window. " +
  "Returns cliff completions, tranche unlocks, and linear stream endings sorted by date. " +
  "Ideal for forecasting when tokens become available, scheduling claims, or building alerts.",
  {
    address: z.string().describe(
      "EVM wallet address in 0x format"
    ),
    days: z.number().optional().describe(
      "Lookahead window in days (default: 30, max: 365)"
    ),
    protocol: z.string().optional().describe(
      "Comma-separated protocol filter, e.g. 'sablier,uncx'"
    ),
  },
  async ({ address, days, protocol }) => {
    const qs = new URLSearchParams();
    if (days)     qs.set("days",     String(days));
    if (protocol) qs.set("protocol", protocol);
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
  "e.g. 'sablier-1-12345' or 'uncx-8453-99'. " +
  "Use get_wallet_vestings first to discover stream IDs for a wallet.",
  {
    stream_id: z.string().describe(
      "Composite stream ID in format 'protocol-chainId-nativeId', " +
      "e.g. 'sablier-1-12345', 'hedgey-8453-42', 'uncx-1-7'"
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
