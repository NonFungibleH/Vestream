// Webhook subscriptions — Pro tier and above.
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/webhooks       — list this key's subscriptions
// POST /api/v1/webhooks       — create a new subscription
//
// (DELETE for per-row removal lives in /api/v1/webhooks/[id]/route.ts.)
//
// Auth: Bearer vstr_live_… via the standard authenticateApiKey() flow.
// Tier gate: Free tier returns 402; only Pro and above can create/list.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";

// Receiver-friendly subset returned by listing endpoints. Never includes
// the raw secret hash — only its first 8 chars for identification.
function publicShape(row: typeof webhookSubscriptions.$inferSelect) {
  return {
    id:              row.id,
    url:             row.url,
    secret_prefix:   row.secret.slice(0, 14), // "whsec_" + 8 hex chars
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

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);
  if (auth.tier === "free") return tierGate();

  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.apiKeyId, auth.keyId))
    .orderBy(desc(webhookSubscriptions.createdAt))
    .limit(50);

  const res = NextResponse.json({ subscriptions: rows.map(publicShape) });
  return withRateLimitHeaders(res, auth);
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);
  if (auth.tier === "free") return tierGate();

  let body: {
    url?:             string;
    wallet_filter?:   string[];
    protocol_filter?: string[];
    chain_filter?:    number[];
    events?:          string[];
    hours_before?:    number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Input validation ────────────────────────────────────────────────────
  const url = (body.url ?? "").trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    return NextResponse.json({ error: "url must be a valid http(s) URL" }, { status: 400 });
  }
  if (process.env.NODE_ENV === "production" && !/^https:\/\//i.test(url)) {
    return NextResponse.json({ error: "Production webhooks must use https://" }, { status: 400 });
  }

  const events = Array.isArray(body.events) && body.events.length > 0
    ? body.events.filter((e) => typeof e === "string" && e === "upcoming_unlock")
    : ["upcoming_unlock"];
  if (events.length === 0) {
    return NextResponse.json({ error: "events must include at least one supported event" }, { status: 400 });
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

  // ── Subscription cap (50 per key) ───────────────────────────────────────
  const existingRow = await db
    .select({ id: webhookSubscriptions.id })
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.apiKeyId, auth.keyId));
  if (existingRow.length >= 50) {
    return NextResponse.json(
      { error: "Maximum 50 subscriptions per API key. Delete one first." },
      { status: 400 },
    );
  }

  // ── Generate signing secret ─────────────────────────────────────────────
  // The secret itself is the HMAC key, stored as plaintext (HMAC needs the
  // same key on both sides). The receiver verifies each delivery by
  // recomputing hmacSha256(secret, rawBody) and comparing against the
  // X-TokenVest-Signature header. We show the plaintext once on create
  // and refer to it via its 14-char prefix everywhere afterwards.
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

  const inserted = await db.insert(webhookSubscriptions).values({
    apiKeyId:       auth.keyId,
    url,
    secret,
    walletFilter,
    protocolFilter,
    chainFilter,
    events,
    hoursBefore,
  }).returning();

  const res = NextResponse.json({
    subscription: publicShape(inserted[0]),
    secret, // ONE-TIME visible — store this safely on your end
  }, { status: 201 });
  return withRateLimitHeaders(res, auth);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tierGate() {
  return NextResponse.json(
    {
      error: "Webhook subscriptions are a Pro-tier feature.",
      docs:  "https://vestream.io/pricing",
    },
    { status: 402 },
  );
}
