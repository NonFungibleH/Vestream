// Per-search PATCH (rename / toggle alerts) and DELETE.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { isPaidTier, type Tier } from "@/lib/auth/tier";

export const runtime = "nodejs";

async function authedPaidUser(): Promise<{ id: string } | NextResponse> {
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
  return { id: u.id };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authedPaidUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: { name?: string; alertsEnabled?: boolean; lastViewedAt?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Partial<typeof savedSearches.$inferInsert> = {};
  if (typeof body.name === "string") update.name = body.name.trim().slice(0, 80);
  if (typeof body.alertsEnabled === "boolean") update.alertsEnabled = body.alertsEnabled;
  if (body.lastViewedAt === true) update.lastViewedAt = new Date();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const result = await db
    .update(savedSearches)
    .set(update)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, auth.id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ search: result[0] });
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authedPaidUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const result = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, auth.id)))
    .returning({ id: savedSearches.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
