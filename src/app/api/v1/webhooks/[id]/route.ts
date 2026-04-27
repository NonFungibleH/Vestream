// DELETE /api/v1/webhooks/{id}
// Deletes a single subscription. Owner-scoped via the requesting API key.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);
  if (auth.tier === "free") {
    return NextResponse.json({ error: "Webhook subscriptions are a Pro-tier feature." }, { status: 402 });
  }

  const { id } = await params;
  const result = await db
    .delete(webhookSubscriptions)
    .where(and(
      eq(webhookSubscriptions.id, id),
      eq(webhookSubscriptions.apiKeyId, auth.keyId),
    ))
    .returning({ id: webhookSubscriptions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true, deleted: id });
  return withRateLimitHeaders(res, auth);
}
