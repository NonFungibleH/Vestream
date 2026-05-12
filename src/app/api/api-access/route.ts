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
import { normaliseEmail, isDisposableEmail } from "@/lib/email-validation";

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
  // Centralised email normalisation: lowercases, trims, strips trailing dot,
  // returns null on shape failures. Single source of truth across the public
  // email-capture endpoints (waitlist, find-vestings/save-link, contact,
  // api-access, beta-feedback).
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail)
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  // Closes the API-key farming abuse vector: a burner-mailbox service (e.g.
  // mailinator, 10minutemail) lets one attacker spin up unlimited free
  // 150/day keys. The 17-domain blocklist in lib/email-validation.ts is the
  // same one the rest of the public email endpoints already use.
  if (isDisposableEmail(cleanEmail))
    return NextResponse.json(
      { error: "Disposable email addresses aren't allowed. Please use your work or personal email." },
      { status: 400 },
    );
  if (!useCase || typeof useCase !== "string" || useCase.trim().length < 10)
    return NextResponse.json({ error: "Please describe your use case (min 10 characters)" }, { status: 400 });

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
  // Enumeration-safe: the response shape is identical regardless of whether
  // the email already had a key or got a fresh one. The actual key (new) or
  // recovery info (existing) is delivered via email — the only channel the
  // legitimate email owner can read. An attacker probing addresses gets the
  // same generic confirmation either way.
  const existing = await db
    .select({ keyPrefix: apiKeys.keyPrefix, tier: apiKeys.tier })
    .from(apiKeys)
    .where(eq(apiKeys.ownerEmail, cleanEmail))
    .limit(1);

  if (existing.length > 0 && existing[0].keyPrefix) {
    // Existing key — email the owner a "you already have one" recovery
    // note rather than issuing a duplicate. Same fire-and-forget pattern
    // as the new-key path so the response timing matches.
    void sendExistingKeyEmail(cleanEmail, name.trim(), existing[0].keyPrefix, existing[0].tier ?? "free").catch((err) => {
      console.error("[api-access] Failed to send existing-key email:", err);
    });
  } else {
    // No existing key — issue a fresh free-tier one and email the plaintext.
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

    // Best-effort delivery. We no longer have an in-response fallback for
    // Resend failures (was the whole point of removing the enumeration);
    // a delivery error here means the user has to email support. That's
    // the trade we accept to close the leak — Resend reliability is
    // > 99% in practice so the recovery channel is rarely needed.
    void sendNewKeyEmail(cleanEmail, name.trim(), plaintext, prefix).catch((err) => {
      console.error("[api-access] Failed to send new-key email:", err);
    });
  }

  // Identical response for both branches. No `issued` / `already_issued`
  // flag, no prefix, no tier — those all leak whether the email is on file.
  return NextResponse.json({
    ok:      true,
    message: "If you're eligible, an API key will be emailed to you shortly. Check your inbox (and spam folder).",
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sendNewKeyEmail(email: string, name: string, plaintext: string, prefix: string): Promise<void> {
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

/**
 * "You already have a key" recovery email. Sent when the form was submitted
 * for an email that already has an active key on file. Includes the prefix
 * (which is non-secret — it's the first 17 chars of the plaintext) so the
 * recipient can verify which key is theirs in their secret manager. The
 * plaintext is irrecoverable (stored only as a hash) so we direct them to
 * support if they've lost it.
 */
async function sendExistingKeyEmail(email: string, name: string, prefix: string, tier: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[api-access] RESEND_API_KEY missing — skipping existing-key email");
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@vestream.io";

  await resend.emails.send({
    from:    fromAddress,
    to:      email,
    subject: "Your Vestream API key (already on file)",
    text: [
      `Hi ${name},`,
      "",
      "You already have a Vestream API key on file for this email — we",
      "haven't issued a new one.",
      "",
      `Tier:   ${tier}`,
      `Prefix: ${prefix}`,
      "",
      "If you have your key stored, you can keep using it as normal. If",
      "you've lost the plaintext, reply to this email and we'll revoke",
      "the existing key and issue a fresh one. We can't recover lost keys",
      "directly — only the hash is stored, never the plaintext.",
      "",
      "— The Vestream team (3UILD LLC)",
    ].join("\n"),
  });
}
