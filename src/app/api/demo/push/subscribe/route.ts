// src/app/api/demo/push/subscribe/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Stores a web-push subscription tied to an active demo session.
//
// The visitor's demo state lives in an iron-session cookie — but the cron job
// that fires milestone notifications can't read per-user cookies, so we mirror
// the minimal session snapshot (sessionId, startMs, total, durationSec) into
// the DB alongside the push subscription. The cron then scans all rows newer
// than 30 minutes and fires pushes at each 25% milestone.
//
// Rate-limited: 5 subscribes per IP per 10 minutes — prevents spam. Anonymous
// (no auth) — the iron-session cookie is the only identity.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { demoPushSubscriptions } from "@/lib/db/schema";
import { getDemoSession } from "@/lib/demo/session";
import { DEMO_CONFIG } from "@/lib/demo/config";
import { checkRateLimit } from "@/lib/ratelimit";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

interface SubscribeBody {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}

function isValidSub(s: unknown): s is SubscribeBody["subscription"] {
  if (!s || typeof s !== "object") return false;
  const r = s as Record<string, unknown>;
  if (typeof r.endpoint !== "string" || !r.endpoint.startsWith("https://")) return false;
  const keys = r.keys as Record<string, unknown> | undefined;
  return !!keys && typeof keys.p256dh === "string" && typeof keys.auth === "string";
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit("demo-push-sub", getIp(req), 5, "10 m");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many subscribe attempts." }, { status: 429 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSub(body.subscription)) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const demoSession = await getDemoSession();
  if (!demoSession.sessionId || !demoSession.startMs) {
    return NextResponse.json(
      { error: "No active demo session — press Start first." },
      { status: 400 },
    );
  }

  const sub       = body.subscription;
  const sessionId = demoSession.sessionId;

  try {
    // Upsert by endpoint: if the user re-subscribes with the same browser, we
    // refresh the row rather than accumulate duplicates.
    const existing = await db
      .select({ id: demoPushSubscriptions.id })
      .from(demoPushSubscriptions)
      .where(eq(demoPushSubscriptions.endpoint, sub.endpoint))
      .limit(1);

    // Mirror the visitor's chosen config (or DEMO_CONFIG fallback) so the cron
    // can build accurate payloads — "2.50K NOVA unlocked" instead of defaults.
    const tokenSymbol = demoSession.tokenSymbol ?? DEMO_CONFIG.tokenSymbol;
    const durationSec = demoSession.durationSec ?? DEMO_CONFIG.durationSec;
    const total       = demoSession.total       ?? DEMO_CONFIG.totalAmount;

    if (existing.length > 0) {
      await db
        .update(demoPushSubscriptions)
        .set({
          sessionId,
          subscription:    sub,
          startMs:         String(demoSession.startMs),
          durationSec,
          total,
          tokenSymbol,
          milestonesFired: [],
        })
        .where(eq(demoPushSubscriptions.id, existing[0].id));
    } else {
      await db.insert(demoPushSubscriptions).values({
        sessionId,
        endpoint:        sub.endpoint,
        subscription:    sub,
        startMs:         String(demoSession.startMs),
        durationSec,
        total,
        tokenSymbol,
        milestonesFired: [],
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/demo/push/subscribe error:", err);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
