# Vestream — Claude Code Guide

## Project Overview

Vestream is a token vesting data platform built with Next.js 16 App Router (TypeScript), Drizzle ORM, Supabase/Postgres, and Tailwind CSS. It aggregates real-time vesting streams from Sablier, UNCX, Hedgey, Unvest, and Team Finance across Ethereum, BNB Chain, Base, and Polygon.

This project uses **JavaScript, TypeScript, CSS, and JSON**. When editing code, match the language and style conventions of the existing file — preserve indentation style, quote style, and naming conventions.

### Key directories
- `src/app/` — Next.js App Router pages and API routes
- `src/lib/vesting/` — chain adapters (one file per protocol), types, and aggregation logic
- `src/components/` — shared UI components (SiteNav, UpsellModal, etc.)
- `src/middleware.ts` — cookie-based route gating (early access, admin, API keys)
- `mcp/` — `@vestream/mcp` npm package (MCP server for AI agent tool use)
- `scripts/` — one-off utility scripts (diagram generation, etc.)

### Auth cookies
- `vestr_early_access` — gates `/dashboard`
- `vestr_admin` — gates `/admin`
- `vestr_api_access` — gates `/api-docs` and `/developer/account`

### Supported chains
| Chain | ID |
|---|---|
| Ethereum | 1 |
| BNB Chain | 56 |
| Polygon | 137 |
| Base | 8453 |
| Sepolia (testnet) | 11155111 |

---

## Build & Deploy

### Working directory
**Always run `pwd` before executing build or deploy commands** to confirm you are in the correct directory. Most commands must be run from `/Users/howardpearce/vestr` (project root) or `/Users/howardpearce/vestr/mcp` for the MCP package.

### Pre-publish checklist
**Before attempting to publish packages (npm, App Store, Chrome Web Store), verify all authentication and credentials are properly configured in a single upfront check** — do not discover issues iteratively mid-publish.

For npm:
1. Run `npm whoami` — confirm the correct account is logged in
2. Run `npm token list` — confirm the active token has write access to the target scope
3. Check `package.json` name/version/scope are correct and the org exists on npm
4. Run `npm publish --dry-run` first to catch any packaging issues
5. Only then run `npm publish --access public`

For Vercel (production deploys):
- Pushes to `main` auto-deploy via GitHub integration
- Environment variables are set in Vercel dashboard → Settings → Environment Variables
- Required env vars: `DATABASE_URL`, `GRAPH_API_KEY`, `POLYGON_RPC_URL`, `ALCHEMY_RPC_URL_ETH`, `ALCHEMY_RPC_URL_BASE`, `BSC_RPC_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### Local dev
```bash
cd /Users/howardpearce/vestr
npm run dev       # starts on localhost:3000
npm run build     # production build (catches TS errors)
```

### MCP package
```bash
cd /Users/howardpearce/vestr/mcp
npm run build     # compiles TypeScript → dist/
npm publish --access public   # publish to npm (requires auth token)
```
