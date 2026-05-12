# Security

Vestream takes security seriously. This document covers our reporting channel, our current security posture, and known issues we've evaluated and consciously accepted.

## Reporting a vulnerability

Email **security@vestream.io** with the details. We aim to acknowledge within 1 business day. Please do not file public issues on GitHub for security matters.

We don't run a paid bug bounty program at this time, but we publicly credit reporters who give us a reasonable disclosure window.

## Current posture

- **Database**: Supabase Postgres, accessed exclusively server-side via Drizzle ORM. Row-Level Security is enabled on every public table; no client-side anon key or PostgREST API surface is exposed.
- **Auth**:
  - Web dashboard: iron-session cookie set via QR pairing from the mobile app. `httpOnly`, `secure` (prod), `sameSite: strict`.
  - Mobile: Bearer tokens, SHA-256-hashed at rest, 90-day TTL.
  - Developer API: `vstr_live_...` keys, SHA-256-hashed at rest, never stored in plaintext after issuance.
- **Webhooks** (RevenueCat + Stripe): signature-verified, replay-protected via `(event_id, source)` dedup table.
- **Rate limits**: every public endpoint that writes to the DB or calls an external API is rate-limited via Upstash Redis. Limits scale with the cost of the underlying operation.
- **HTTP headers**: `X-Frame-Options: DENY`, `Strict-Transport-Security` (preload), `Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation/payment/usb/bluetooth.
- **CSRF**: `sameSite: strict` cookies on every authenticated surface, plus explicit `Origin` checks on unauthenticated POST endpoints.
- **Dependency hygiene**: `npm audit` is part of pre-launch review. We pin patched versions via `overrides` where transitive deps lag upstream fixes.

## Known accepted risks

### `bigint-buffer` chain (Solana SDK transitive)

- **Advisory**: [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) — buffer overflow in `toBigIntLE()`.
- **CVSS vector**: `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` — Availability only. **No** confidentiality or integrity impact. Worst case is a crashed function invocation, not RCE.
- **Status**: `bigint-buffer` is abandoned upstream (last release 2019). No patched version exists. The entire Solana ecosystem ships with this dep transitively via `@solana/web3.js 1.x` and `@solana/spl-token`. `@solana/web3.js 2.x` removes it, but `@streamflow/stream` doesn't support v2 yet.
- **Mitigation**: All Solana adapter entry points wrap SDK calls in `try/catch` blocks that log and return empty arrays. A bigint-buffer crash becomes a logged error, not a process kill. Exploitation would also require an attacker to host a malicious Solana program account *and* trick our scanner into reading it during a wallet scan — a server-side-only, DoS-only path.
- **Re-evaluate when**: `@streamflow/stream` ships a major release that drops the dep, or Solana's ecosystem migrates to web3.js v2.

### CSP `unsafe-inline` and `unsafe-eval`

- **Constraint**: Next.js App Router and Tailwind both require inline scripts and runtime eval. Strict-CSP nonce-based policies require framework-level support for tagging *every* generated `<script>` tag, which Next.js doesn't currently expose for the App Router code path.
- **Compensating controls**: We have no `dangerouslySetInnerHTML` paths that flow user-controlled HTML into render. All `dangerouslySetInnerHTML` calls in our codebase are either `JSON.stringify(jsonLd)` (SEO structured data, server-built static) or hardcoded marketing HTML from `lib/articles.ts`. `X-Frame-Options: DENY`, `Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `form-action 'self'`, and `base-uri 'self'` provide layered defenses against the attack classes CSP would otherwise mitigate.
- **Re-evaluate when**: Next.js exposes a stable nonce-injection API for App Router inline scripts.

### RevenueCat webhook timestamp signing

- **Constraint**: RevenueCat does not include a timestamp in its webhook signature, so a captured payload could in principle be replayed against our endpoint at any future time.
- **Mitigation**: We dedup by `event.id` server-side (`webhook_event_dedup` table) — a replayed payload is acknowledged with `200 OK` but produces no side effects. Combined with the shared secret in the `Authorization` header (timing-safe comparison) and TLS in transit, the practical replay surface is closed.

## Hardening change log

The full audit + remediation history lives in the `hardening:` commit prefix on `main` (currently 8 commits covering rate limits, email enumeration closure, CORS, sameSite tightening, dependency overrides, webhook dedup, and `bigint-buffer` documentation).
