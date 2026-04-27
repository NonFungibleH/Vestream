// Cookie-authed proxy for per-row webhook deletion. Owner-scoped.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, webhookSubscriptions } from "@/lib/db/schema";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [key] = await db
    .select({ tier: apiKeys.tier, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  if (!key || key.revokedAt) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }
  if (key.tier === "free") {
    return NextResponse.json({ error: "Pro-tier feature." }, { status: 402 });
  }

  const { id } = await params;
  const result = await db
    .delete(webhookSubscriptions)
    .where(and(
      eq(webhookSubscriptions.id, id),
      eq(webhookSubscriptions.apiKeyId, keyId),
    ))
    .returning({ id: webhookSubscriptions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
