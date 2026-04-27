// Saved-searches CRUD for the explorer.
// Pro / Fund tier only. List, create. Per-row patch/delete in [id]/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { isPaidTier, type Tier } from "@/lib/auth/tier";

export const runtime = "nodejs";

// Hard cap so a Pro user can't accidentally rack up thousands of cron-triggered
// saved searches. 50 is generous (most power users save 5-15).
const SAVED_SEARCH_LIMIT = 50;

async function authedPaidUser(): Promise<{ id: string; tier: Tier } | NextResponse> {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const row = await db
    .select({ id: users.id, tier: users.tier })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  const u = row[0];
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tier = (u.tier === "pro" || u.tier === "fund") ? u.tier : "free";
  if (!isPaidTier(tier as Tier)) {
    return NextResponse.json({ error: "Saved searches are a Pro feature" }, { status: 403 });
  }
  return { id: u.id, tier: tier as Tier };
}

export async function GET() {
  const auth = await authedPaidUser();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, auth.id))
    .orderBy(desc(savedSearches.lastViewedAt), desc(savedSearches.createdAt))
    .limit(SAVED_SEARCH_LIMIT);

  return NextResponse.json({ searches: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authedPaidUser();
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string; params?: Record<string, string>; alertsEnabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.params || typeof body.params !== "object") {
    return NextResponse.json({ error: "params object required" }, { status: 400 });
  }
  // Strip non-string values defensively (URL params are always strings).
  const sanitised: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.params)) {
    if (typeof v === "string" && v.length > 0 && v.length < 200) {
      sanitised[k] = v;
    }
  }

  // Enforce per-user limit.
  const existing = await db
    .select({ id: savedSearches.id })
    .from(savedSearches)
    .where(eq(savedSearches.userId, auth.id));
  if (existing.length >= SAVED_SEARCH_LIMIT) {
    return NextResponse.json(
      { error: `You can save up to ${SAVED_SEARCH_LIMIT} searches. Delete some first.` },
      { status: 400 },
    );
  }

  const fallbackName = describeParams(sanitised);
  const inserted = await db.insert(savedSearches).values({
    userId:        auth.id,
    name:          (body.name?.trim() || fallbackName).slice(0, 80),
    paramsJson:    JSON.stringify(sanitised),
    alertsEnabled: body.alertsEnabled === true,
  }).returning();

  return NextResponse.json({ search: inserted[0] }, { status: 201 });
}

function describeParams(p: Record<string, string>): string {
  const bits: string[] = [];
  if (p.q)        bits.push(`"${p.q}"`);
  if (p.protocol) bits.push(p.protocol);
  if (p.chain)    bits.push(`chain ${p.chain}`);
  if (p.date && p.date !== "30-days") bits.push(p.date);
  if (p.amount)   bits.push(`>${p.amount}`);
  if (bits.length === 0) bits.push(p.mode ?? "calendar");
  return bits.join(" · ");
}
