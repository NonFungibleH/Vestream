#!/usr/bin/env node
/**
 * Vestream MCP Server
 *
 * Exposes Vestream's vesting data API as native tools for AI agents
 * (Claude, GPT, LangChain, CrewAI, etc.) via Anthropic's Model Context Protocol.
 *
 * Usage (add to your Claude Desktop config):
 * {
 *   "mcpServers": {
 *     "vestream": {
 *       "command": "npx",
 *       "args": ["-y", "@vestream/mcp"],
 *       "env": { "VESTREAM_API_KEY": "vstr_live_..." }
 *     }
 *   }
 * }
 *
 * Or run directly:
 *   VESTREAM_API_KEY=vstr_live_... npx ts-node mcp/vestream.ts
 */

import { createServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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

const server = createServer(
  {
    name:    "vestream",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name:        "get_wallet_vestings",
      description:
        "Get all vesting streams for a wallet address across all supported protocols " +
        "(Sablier, UNCX, Hedgey, Unvest, Team Finance) and chains. Returns normalised " +
        "stream data including amounts, schedules, cliff dates, and claim history.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type:        "string",
            description: "EVM wallet address (0x...)",
          },
          protocol: {
            type:        "string",
            description: "Optional comma-separated protocol filter e.g. 'sablier,uncx'",
          },
          chain: {
            type:        "string",
            description: "Optional comma-separated chain ID filter e.g. '1,8453'",
          },
          active_only: {
            type:        "boolean",
            description: "If true, exclude fully-vested streams (default: false)",
          },
        },
        required: ["address"],
      },
    },
    {
      name:        "get_upcoming_unlocks",
      description:
        "Get all upcoming vesting unlock events for a wallet within a time window. " +
        "Returns cliffs, tranches, and linear stream endings sorted by date. " +
        "Ideal for forecasting, alert systems, or claim optimisation.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type:        "string",
            description: "EVM wallet address (0x...)",
          },
          days: {
            type:        "number",
            description: "Lookahead window in days (default: 30, max: 365)",
          },
          protocol: {
            type:        "string",
            description: "Optional comma-separated protocol filter",
          },
        },
        required: ["address"],
      },
    },
    {
      name:        "get_stream",
      description:
        "Get full details for a single vesting stream by its ID. " +
        "Stream IDs follow the format: {protocol}-{chainId}-{nativeId} " +
        "e.g. 'sablier-1-12345'. Use get_wallet_vestings first to discover stream IDs.",
      inputSchema: {
        type: "object",
        properties: {
          stream_id: {
            type:        "string",
            description: "Stream composite ID e.g. 'sablier-1-12345'",
          },
        },
        required: ["stream_id"],
      },
    },
  ],
}));

// ── Tool execution ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let data: unknown;

    switch (name) {
      case "get_wallet_vestings": {
        const { address, protocol, chain, active_only } = args as {
          address: string; protocol?: string; chain?: string; active_only?: boolean;
        };
        const qs = new URLSearchParams();
        if (protocol)    qs.set("protocol",    protocol);
        if (chain)       qs.set("chain",       chain);
        if (active_only) qs.set("active_only", "true");
        const query = qs.toString() ? `?${qs}` : "";
        data = await vstreamFetch(`/wallet/${address}/vestings${query}`);
        break;
      }

      case "get_upcoming_unlocks": {
        const { address, days, protocol } = args as {
          address: string; days?: number; protocol?: string;
        };
        const qs = new URLSearchParams();
        if (days)     qs.set("days",     String(days));
        if (protocol) qs.set("protocol", protocol);
        const query = qs.toString() ? `?${qs}` : "";
        data = await vstreamFetch(`/wallet/${address}/upcoming-unlocks${query}`);
        break;
      }

      case "get_stream": {
        const { stream_id } = args as { stream_id: string };
        data = await vstreamFetch(`/stream/${stream_id}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vestream-mcp] Server running. Waiting for MCP client...");
}

main().catch((err) => {
  console.error("[vestream-mcp] Fatal error:", err);
  process.exit(1);
});
