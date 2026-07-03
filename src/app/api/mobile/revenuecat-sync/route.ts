// src/app/api/mobile/revenuecat-sync/route.ts
//
// Server-side RevenueCat entitlement verification — the durable fallback that
// makes the async webhook (revenuecat-webhook/route.ts) no longer a single
// point of failure.
//
// Why this exists:
//   The backend used to learn about a paid subscription ONLY from RevenueCat's
//   webhook. If that webhook was misconfigured, its secret drifted, or it
//   simply raced the client, a paying customer stayed on tier="free" in the DB
//   with no way to self-heal. (This bit our first paying customer — RC showed
//   the purchase, the DB never updated.)
//
// What this does:
//   The authenticated mobile client calls this endpoint after a purchase /
//   restore, and on app launch when it isn't already Pro. We ask RevenueCat's
//   REST API — server-to-server, using the SECRET key — whether THIS user
//   (app_user_id === users.id) holds an active entitlement, and upgrade the DB
//   tier if so. No webhook required.
//
// Upgrade-only by design:
//   This route only ever promotes free → pro. It never downgrades. Downgrades
//   remain the webhook's job (EXPIRATION). That keeps a transient RC API blip
//   from knocking a paying user offline, and sidesteps the reviewer backdoor
//   (which force-sets tier="pro" at login — see auth/email/route.ts).
//
// Requires env REVENUECAT_SECRET_KEY (the sk_... secret API key from
// RevenueCat → Project Settings → API Keys). No-ops (503) if unset.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { hasActiveEntitlement, type RCSubscriberResponse } from "@/lib/revenuecat-entitlements";

// RevenueCat v1 REST — subscriber lookup. app_user_id is our users.id UUID,
// which is exactly what the mobile SDK is configured with (initPurchases).
const RC_API_BASE = "https://api.revenuecat.com/v1";

export async function POST(req: NextRequest) {
  // ── Auth: standard mobile bearer token → resolves to users.id (the UUID
  //    that IS the RevenueCat app_user_id). No user can sync another user. ──
  const token = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = env.REVENUECAT_SECRET_KEY;
  if (!secret) {
    // Fail soft: without the secret key we simply can't verify. Report the
    // current tier so the client keeps working; the webhook is still the
    // primary path. Logged so the config gap surfaces.
    console.error("[RC Sync] REVENUECAT_SECRET_KEY not set — cannot verify entitlements");
    const user = await getMobileUser(userId);
    return NextResponse.json(
      { tier: user?.tier ?? "free", changed: false, verified: false },
      { status: 503 },
    );
  }

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already Pro → nothing to heal. Cheap short-circuit that also avoids an RC
  // API call on every launch for existing subscribers.
  if (user.tier === "pro" || user.tier === "mobile") {
    return NextResponse.json({ tier: "pro", changed: false, verified: true });
  }

  // ── Ask RevenueCat, server-to-server, whether this user is entitled ──
  let active = false;
  try {
    const res = await fetch(`${RC_API_BASE}/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      // Never cache a subscription check.
      cache: "no-store",
    });

    if (res.status === 404) {
      // RC has never seen this app_user_id → definitely not a subscriber.
      return NextResponse.json({ tier: user.tier ?? "free", changed: false, verified: true });
    }
    if (!res.ok) {
      console.error(`[RC Sync] RevenueCat API ${res.status} for user ${userId}`);
      return NextResponse.json(
        { tier: user.tier ?? "free", changed: false, verified: false },
        { status: 502 },
      );
    }

    const body = (await res.json()) as RCSubscriberResponse;
    active = hasActiveEntitlement(body.subscriber?.entitlements, Date.now());
  } catch (err) {
    console.error("[RC Sync] fetch error:", err);
    return NextResponse.json(
      { tier: user.tier ?? "free", changed: false, verified: false },
      { status: 502 },
    );
  }

  // ── Upgrade-only: promote to pro if entitled; never downgrade here ──
  if (active) {
    await db.update(users).set({ tier: "pro" }).where(eq(users.id, userId));
    console.log(`[RC Sync] user ${userId} verified entitled → tier set to pro`);
    return NextResponse.json({ tier: "pro", changed: true, verified: true });
  }

  return NextResponse.json({ tier: user.tier ?? "free", changed: false, verified: true });
}
