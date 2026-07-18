// Cookie-authed proxy to the webhook subscription store.
// ─────────────────────────────────────────────────────────────────────────────
// The public /api/v1/webhooks endpoints require Bearer-token auth (so MCP
// agents and external integrations can hit them with just an API key). But
// our /developer/account UI is logged in via the `vestr_api_access`
// cookie, NOT the plaintext key — we never store plaintext, only its
// SHA-256 hash. So the UI talks to this internal endpoint instead, which
// resolves the cookie's keyId → apiKeyId and runs the same DB ops.
//
// Same shape as the public endpoint (same JSON, same status codes) so the
// panel UI is API-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/lib/db";
import { apiKeys, webhookSubscriptions } from "@/lib/db/schema";
import { assertPublicWebhookUrl } from "@/lib/ssrf-guard";

function publicShape(row: typeof webhookSubscriptions.$inferSelect) {
  return {
    id:              row.id,
    url:             row.url,
    secret_prefix:   row.secret.slice(0, 14),
    wallet_filter:   row.walletFilter ?? null,
    protocol_filter: row.protocolFilter ?? null,
    chain_filter:    row.chainFilter ?? null,
    events:          row.events,
    hours_before:    row.hoursBefore,
    last_fired_at:   row.lastFiredAt,
    failure_count:   row.failureCount,
    disabled_at:     row.disabledAt,
    created_at:      row.createdAt,
  };
}

async function authedKey(): Promise<{ id: string; tier: string } | NextResponse> {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) {
    return NextResponse.json({ error: "Sign in via /developer/portal first." }, { status: 401 });
  }
  const [key] = await db
    .select({ id: apiKeys.id, tier: apiKeys.tier, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  if (!key || key.revokedAt) {
    return NextResponse.json({ error: "API key not found or revoked." }, { status: 404 });
  }
  if (key.tier === "free") {
    return NextResponse.json(
      { error: "Webhooks are a Pro-tier feature.", upgrade_url: "/developer/account" },
      { status: 402 },
    );
  }
  return { id: key.id, tier: key.tier };
}

export async function GET() {
  const auth = await authedKey();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.apiKeyId, auth.id))
    .orderBy(desc(webhookSubscriptions.createdAt))
    .limit(50);
  return NextResponse.json({ subscriptions: rows.map(publicShape) });
}

export async function POST(req: NextRequest) {
  const auth = await authedKey();
  if (auth instanceof NextResponse) return auth;

  let body: {
    url?:             string;
    wallet_filter?:   string[];
    protocol_filter?: string[];
    chain_filter?:    number[];
    hours_before?:    number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  // SSRF guard: scheme + reject loopback/private/link-local hosts, and resolve
  // DNS to reject hostnames pointing at internal/metadata addresses.
  const urlCheck = await assertPublicWebhookUrl(url, { requireHttps: process.env.NODE_ENV === "production" });
  if (!urlCheck.ok) {
    return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
  }

  const hoursBefore = Number.isFinite(body.hours_before)
    ? Math.max(1, Math.min(168, Math.floor(body.hours_before as number)))
    : 24;

  const walletFilter = Array.isArray(body.wallet_filter)
    ? body.wallet_filter.filter((s) => typeof s === "string").map((s) => s.toLowerCase())
    : null;
  const protocolFilter = Array.isArray(body.protocol_filter)
    ? body.protocol_filter.filter((s) => typeof s === "string").map((s) => s.toLowerCase())
    : null;
  const chainFilter = Array.isArray(body.chain_filter)
    ? body.chain_filter.filter((n) => typeof n === "number" && Number.isFinite(n))
    : null;

  // Per-key cap of 50 — same as the Bearer-authed endpoint.
  const existing = await db
    .select({ id: webhookSubscriptions.id })
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.apiKeyId, auth.id));
  if (existing.length >= 50) {
    return NextResponse.json({ error: "Max 50 subscriptions per key. Delete one first." }, { status: 400 });
  }

  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const inserted = await db.insert(webhookSubscriptions).values({
    apiKeyId:       auth.id,
    url,
    secret,
    walletFilter,
    protocolFilter,
    chainFilter,
    events:         ["upcoming_unlock"],
    hoursBefore,
  }).returning();

  return NextResponse.json({
    subscription: publicShape(inserted[0]),
    secret, // ONE-TIME — store it now or you'll need to recreate
  }, { status: 201 });
}
