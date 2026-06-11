// src/app/api/mobile/watchlist/[id]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-entry watchlist mutations: PATCH (label + alert toggles) and DELETE.
// Both are scoped to the requesting user so one user can never touch another's
// row even with a guessed UUID. 2026-06-11.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { watchlist } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { label, weeklyDigest, perEventPush } = body;

  // Build a sparse update — only touch fields the client actually sent.
  const patch: Record<string, unknown> = {};
  if (label !== undefined) {
    patch.label = typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : null;
  }
  if (typeof weeklyDigest === "boolean") patch.weeklyDigest = weeklyDigest;
  if (typeof perEventPush === "boolean") patch.perEventPush = perEventPush;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const [entry] = await db.update(watchlist)
    .set(patch)
    .where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)))
    .returning();

  if (!entry) return NextResponse.json({ error: "Watchlist entry not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(watchlist)
    .where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));

  return NextResponse.json({ ok: true });
}
