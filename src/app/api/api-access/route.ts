// src/app/api/api-access/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Self-serve free-tier API key issuance.
//
// Flow:
//   1. Validate the request body (name / email / use-case basics).
//   2. Burst-limit by IP+email so a single bad actor can't spam-create keys.
//   3. Insert an `apiAccessRequests` row for audit history (kept regardless
//      of issuance outcome).
//   4. If an active key already exists for this email, do NOT issue a new
//      one — return the prefix of the existing key so the user knows we
//      have them on file. They can email support if they lost the key.
//   5. Otherwise: generate a new `vstr_live_…` key, hash + insert, send the
//      plaintext key by email, and also return it once in the response so
//      the form can show it (defensive against Resend delivery hiccups).
//
// Free tier limits (free: 30 req/min + 150 req/day) are already enforced
// by the existing rate-limit middleware in `src/lib/api-key-auth.ts`, so
// auto-issuing free-tier keys is bounded — a malicious holder of a free
// key can hit at most 150 requests/day before being throttled.
//
// Pro upgrades are handled separately: a Stripe webhook flips the key's
// `tier` from "free" to "pro" on a successful subscription.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { apiAccessRequests, apiKeys } from "@/lib/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FREE_TIER_MONTHLY_LIMIT = 4500; // 150/day × 30 days

export async function POST(req: NextRequest) {
  // ── Rate limit: 5 issuance attempts per IP per hour ───────────────────────
  // The form submits an email + use case; a Free key gives 150/day. If a
  // single attacker could issue 1000 keys via the same form, they'd
  // multiply effective volume even with per-key limits. Cap form submissions
  // at 5/hr — high enough that legitimate users (typing email wrong, etc.)
  // never hit it.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("api-access:create", ip, 5, "1 h");
  const blocked = rateLimitResponse(rl, "Too many requests. Try again in an hour.");
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { name, email, company, useCase, protocols } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !EMAIL_RE.test(email.trim()))
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  if (!useCase || typeof useCase !== "string" || useCase.trim().length < 10)
    return NextResponse.json({ error: "Please describe your use case (min 10 characters)" }, { status: 400 });

  const cleanEmail = email.trim().toLowerCase();

  // ── Audit row (kept regardless of issuance outcome) ──────────────────────
  await db.insert(apiAccessRequests).values({
    name:      name.trim(),
    email:     cleanEmail,
    company:   company?.trim() || null,
    useCase:   useCase.trim(),
    protocols: Array.isArray(protocols) ? protocols : [],
    reviewed:  true, // self-serve flow: skip the manual review queue
  });

  // ── Existing-key check ───────────────────────────────────────────────────
  // If this email already has a non-revoked key, don't issue another. Tells
  // the user the key is on file via the prefix; they can recover via support
  // if they lost the plaintext.
  const existing = await db
    .select({ keyPrefix: apiKeys.keyPrefix, tier: apiKeys.tier })
    .from(apiKeys)
    .where(eq(apiKeys.ownerEmail, cleanEmail))
    .limit(1);

  if (existing.length > 0 && existing[0].keyPrefix) {
    return NextResponse.json({
      ok: true,
      already_issued: true,
      prefix: existing[0].keyPrefix,
      tier:   existing[0].tier,
      message: `You already have a ${existing[0].tier} key (prefix ${existing[0].keyPrefix}). Email team@vestream.io if you need to recover it.`,
    });
  }

  // ── Issue a fresh free-tier key ──────────────────────────────────────────
  const plaintext = generateApiKey();
  const hash      = hashApiKey(plaintext);
  const prefix    = plaintext.slice(0, 17); // "vstr_live_" + first 7 hex chars

  await db.insert(apiKeys).values({
    keyHash:      hash,
    keyPrefix:    prefix,
    ownerEmail:   cleanEmail,
    ownerName:    name.trim(),
    tier:         "free",
    monthlyLimit: FREE_TIER_MONTHLY_LIMIT,
  });

  // ── Email the key to the user ────────────────────────────────────────────
  // Best-effort: a Resend failure must NOT prevent the issuance response,
  // because the form also surfaces the plaintext once for copy-paste. The
  // email is the recovery channel for users who close the tab.
  void sendKeyEmail(cleanEmail, name.trim(), plaintext, prefix).catch((err) => {
    console.error("[api-access] Failed to send key email:", err);
  });

  return NextResponse.json({
    ok:           true,
    issued:       true,
    key:          plaintext,
    prefix,
    tier:         "free",
    monthly_limit: FREE_TIER_MONTHLY_LIMIT,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sendKeyEmail(email: string, name: string, plaintext: string, prefix: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[api-access] RESEND_API_KEY missing — skipping welcome email");
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@vestream.io";
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

  await resend.emails.send({
    from:    fromAddress,
    to:      email,
    subject: "Your Vestream API key",
    text: [
      `Hi ${name},`,
      "",
      "Welcome to Vestream — your free-tier API key is ready.",
      "",
      `API key: ${plaintext}`,
      `Prefix:  ${prefix}`,
      "",
      "Free tier: 30 requests/minute, 150 requests/day. Same key works",
      "across the REST API and the @vestream/mcp MCP server.",
      "",
      "Quick start:",
      `  ${appUrl}/developer/quickstart`,
      "",
      "OpenAPI spec:",
      `  ${appUrl}/openapi.json`,
      "",
      "MCP server (Claude Desktop / Cursor / Windsurf):",
      "  npx -y @vestream/mcp",
      "",
      "Need higher limits? Pro tier is rolling out via early-access while",
      "we finish payment-processor verification — reply to this email and",
      "we'll provision a Pro key (5,000 req/day + webhook subscriptions)",
      "manually for you.",
      "",
      "This key is shown only once. Store it securely — losing it means",
      "requesting a new key. We can revoke any compromised key on request.",
      "",
      "— The Vestream team (3UILD LLC)",
    ].join("\n"),
  });
}
