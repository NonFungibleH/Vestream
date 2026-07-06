// src/app/api/admin/revalidate-protocols/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tag-based invalidation for the /protocols index and /protocols/[slug] pages.
//
// Why this exists: when we ship a fix to the protocol pages and want users
// to see fresh data immediately, the brute-force approach is bumping the
// `unstable_cache` key version — but that flushes every entry wholesale,
// so the first request to each protocol pays the cold-render cost (DB query
// + price hydration, ~500ms-2s). This endpoint takes the surgical path:
// `revalidateTag()` marks entries stale without deleting them, so Next can
// serve the stale value while it revalidates in the background. Result:
// zero user-visible downtime on a fresh-data push.
//
// Auth: same dual-auth pattern as the rest of admin/* — admin cookie OR
// `Authorization: Bearer ${CRON_SECRET}`. Bearer lets ops invoke from a
// terminal without the cookie-extraction dance.
//
// Usage:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://vestream.io/api/admin/revalidate-protocols
//
//   { ok: true, revalidated: ["protocol-page", "protocols-page"], ms: 4 }
//
// Idempotent. Safe to call multiple times. If you only want to invalidate
// one of the two layers, pass `?scope=index` or `?scope=detail`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Tags must stay in sync with the `tags:` option on the corresponding
// `unstable_cache(...)` calls. If those change, update here too.
const TAG_PROTOCOL_DETAIL = "protocol-page";     // /protocols/[slug]
const TAG_PROTOCOLS_INDEX = "protocols-page";    // /protocols
const TAG_PROTOCOL_UNLOCKS = "protocol-unlocks"; // /protocols/[slug]/unlocks calendars

function isAuthorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional scope param — defaults to "all". The two pages share data
  // shape but render differently, so keeping them independently
  // invalidatable is occasionally useful (e.g. a fix to the index-page
  // aggregation that doesn't touch detail rendering).
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  const start = Date.now();

  // Next 16 changed the signature to require a profile argument. "max"
  // means "expire as fully as possible" — the right semantics for an
  // on-demand flush. (Other profiles like "minutes"/"hours" are softer
  // invalidations meant for background-cron use, not user-triggered.)
  const revalidated: string[] = [];
  if (scope === "all" || scope === "detail") {
    revalidateTag(TAG_PROTOCOL_DETAIL, "max");
    revalidated.push(TAG_PROTOCOL_DETAIL);
  }
  if (scope === "all" || scope === "index") {
    revalidateTag(TAG_PROTOCOLS_INDEX, "max");
    revalidated.push(TAG_PROTOCOLS_INDEX);
  }
  if (scope === "all" || scope === "unlocks") {
    revalidateTag(TAG_PROTOCOL_UNLOCKS, "max");
    revalidated.push(TAG_PROTOCOL_UNLOCKS);
  }
  // The sitemap is a time-based-ISR route (revalidate=3600) that returns an
  // EMPTY token/symbol list at build time (no DB during build) — so every
  // deploy resets it to a near-empty sitemap for up to an hour. Force a
  // regeneration so the ~2k /token + /tokens/[symbol] URLs come back
  // immediately. Also fired from the refresh-rollups cron so it self-heals.
  if (scope === "all" || scope === "sitemap") {
    revalidatePath("/sitemap.xml");
    revalidated.push("sitemap.xml");
  }

  if (revalidated.length === 0) {
    return NextResponse.json(
      { error: `Unknown scope '${scope}'. Use 'all' | 'detail' | 'index' | 'unlocks' | 'sitemap'.` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok:          true,
    revalidated,
    ms:          Date.now() - start,
  });
}

// GET returns the same payload as a dry-run inspector — useful for
// confirming the endpoint is wired up + auth is working without
// actually nuking the cache.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok:        true,
    dryRun:    true,
    note:      "POST to this endpoint to actually revalidate. ?scope=all|detail|index",
    tags: {
      detail: TAG_PROTOCOL_DETAIL,
      index:  TAG_PROTOCOLS_INDEX,
    },
  });
}
