// src/app/api/mobile/revenuecat-webhook/route.ts
//
// RevenueCat fires this webhook whenever a subscription event occurs.
// It keeps the backend user tier in sync with App Store / Google Play subscriptions.
//
// Setup:
//   1. In RevenueCat dashboard → Project Settings → Webhooks → Add endpoint:
//        URL: https://www.vestream.io/api/mobile/revenuecat-webhook
//        Authorization: <any random 32-char secret you choose>
//   2. Add that secret to Vercel env vars as: REVENUECAT_WEBHOOK_SECRET
//
// RevenueCat event types handled:
//   INITIAL_PURCHASE, RENEWAL, UNCANCELLATION  → set tier from entitlement
//   CANCELLATION, EXPIRATION, BILLING_ISSUE     → downgrade to free

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Events that mean a subscription is now active
const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
// Events that mean the subscription ended or is at risk
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"]);

function tierFromEntitlements(entitlementIds: string[]): "pro" | "fund" {
  if (entitlementIds.includes("fund")) return "fund";
  return "pro";
}

export async function POST(req: NextRequest) {
  // ── Auth: verify the shared secret RevenueCat sends in the Authorization header ──
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (secret) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body?.event;
  if (!event) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  const {
    type,
    app_user_id: userId,          // this is the ID we set in initPurchases(user.id)
    entitlement_ids: entitlementIds = [],
  } = event;

  if (!userId) {
    // No user ID → can't match to a record
    return NextResponse.json({ ok: true, note: "no app_user_id" });
  }

  try {
    if (ACTIVE_EVENTS.has(type)) {
      const tier = tierFromEntitlements(entitlementIds);
      await db.update(users).set({ tier }).where(eq(users.id, userId));
      console.log(`[RC Webhook] ${type} → user ${userId} tier set to ${tier}`);

    } else if (INACTIVE_EVENTS.has(type)) {
      // Only downgrade to free — never accidentally wipe a higher tier
      // (e.g. a billing issue doesn't immediately kill access if they resolve it)
      if (type === "EXPIRATION") {
        await db.update(users).set({ tier: "free" }).where(eq(users.id, userId));
        console.log(`[RC Webhook] EXPIRATION → user ${userId} downgraded to free`);
      } else {
        // CANCELLATION / BILLING_ISSUE — subscription still active until period end;
        // RevenueCat will fire EXPIRATION when it actually ends.
        console.log(`[RC Webhook] ${type} for user ${userId} — no immediate tier change`);
      }
    } else {
      console.log(`[RC Webhook] Unhandled event type: ${type}`);
    }
  } catch (err) {
    console.error("[RC Webhook] DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
