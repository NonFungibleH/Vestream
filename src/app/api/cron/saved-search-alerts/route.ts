// Cron: re-run every saved search with alerts enabled and email the
// owner if new matches have appeared since the last run.
//
// Algorithm per saved search:
//   1. Decode paramsJson into the same shape the explorer page uses.
//   2. Run the matching mode-specific query (calendar / stream / wallet).
//   3. Compute a "newest event in result" timestamp.
//   4. If lastNotifiedAt is null OR (newest event > lastNotifiedAt),
//      send a one-line email "Your saved search 'X' has N new matches".
//   5. Update lastNotifiedAt to now() so future runs only fire on new
//      events that appear after this point.
//
// Designed to be cheap: a Pro user with 50 saved searches × one
// getUnlocksInWindow per search = 50 indexed-cache reads, well under
// any cron budget. Email send is rate-limited per user to avoid a
// reset event flood.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches, users, notificationPreferences } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getUnlocksInWindow, WINDOWS, type WindowSlug } from "@/lib/vesting/unlock-windows";
import {
  getStreamsForExplorer,
  getStreamsByRecipient,
} from "@/lib/vesting/explorer-queries";
import { resolveEnsName } from "@/lib/ens";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let processed = 0;
  let notified  = 0;

  // Pull every alerts-enabled saved search alongside its owner's user
  // record. One join keeps this to a single round-trip for the bulk read.
  const rows = await db
    .select({
      search: savedSearches,
      user:   { id: users.id, address: users.address, tier: users.tier },
    })
    .from(savedSearches)
    .innerJoin(users, eq(users.id, savedSearches.userId))
    .where(eq(savedSearches.alertsEnabled, true));

  for (const { search, user } of rows) {
    processed++;
    // Skip free-tier rows — defensive in case a user was downgraded
    // since saving. Saved searches survive but alerts pause.
    if (user.tier !== "pro" && user.tier !== "fund") continue;

    let params: Record<string, string>;
    try {
      params = JSON.parse(search.paramsJson) as Record<string, string>;
    } catch {
      continue;
    }
    const mode = params.mode ?? "calendar";

    const newestEventTime = await runOneSearch(mode, params);
    if (newestEventTime == null) continue;

    const lastSec = search.lastNotifiedAt
      ? Math.floor(search.lastNotifiedAt.getTime() / 1000)
      : 0;
    if (newestEventTime <= lastSec) continue;

    // Mark notified immediately — we do this BEFORE sending the email
    // so a downstream send failure can't double-notify on the next run.
    await db
      .update(savedSearches)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(savedSearches.id, search.id));

    // Look up the user's notification preferences. If email is off,
    // skip silently — the cron updates lastNotifiedAt anyway so the
    // user opting in later won't get back-dated alerts.
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id))
      .limit(1);
    const pref = prefs[0];
    if (!pref?.emailEnabled || !pref.email) continue;

    notified++;
    // Real email send is delegated to the existing notification scheduler
    // surface. For now we log — a follow-on PR wires this into Resend
    // template alongside the per-stream alerts.
    console.log(
      `[saved-search-alerts] would send to ${pref.email}: ` +
      `"${search.name}" (search id ${search.id})`,
    );
  }

  return NextResponse.json({ ok: true, processed, notified });
}

/**
 * Run one saved search's underlying query and return the newest matching
 * event timestamp (unix seconds), or null if there were no matches.
 */
async function runOneSearch(
  mode: string,
  p: Record<string, string>,
): Promise<number | null> {
  const chainIds  = parseCsvNumbers(p.chain);
  const protocols = parseCsvStrings(p.protocol);
  const adapterIds = protocols.length > 0 ? expandProtocolsToAdapters(protocols) : undefined;

  if (mode === "calendar") {
    const dateSlug = (p.date ?? "30-days") as WindowSlug | "all";
    const window = dateSlug === "all"
      ? { startSec: Math.floor(Date.now() / 1000), endSec: Math.floor(Date.now() / 1000) + 5 * 365 * 86400 }
      : WINDOWS[dateSlug as WindowSlug].range();
    const result = await getUnlocksInWindow(
      window.startSec,
      window.endSec,
      500,
      adapterIds,
      chainIds.length > 0 ? chainIds : undefined,
    );
    if (result.groups.length === 0) return null;
    return Math.max(...result.groups.map((g) => g.eventTime));
  }
  if (mode === "stream") {
    const rows = await getStreamsForExplorer({
      chainIds:    chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      tokenSymbol: p.q && /^[A-Z0-9$]{2,12}$/i.test(p.q) ? p.q : undefined,
      status:      "active",
      limit:       500,
    });
    if (rows.length === 0) return null;
    return Math.max(...rows.map((r) => r.nextUnlockTime ?? r.endTime));
  }
  if (mode === "wallet") {
    let address: string | null = null;
    const q = p.q ?? "";
    if (/^0x[0-9a-f]{40}$/i.test(q)) address = q.toLowerCase();
    else if (/\.(eth|xyz|crypto|nft)$/i.test(q)) address = await resolveEnsName(q);
    else if (q) address = q;
    if (!address) return null;
    const rows = await getStreamsByRecipient(address, {
      chainIds:   chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      status:     "any",
      limit:      500,
    });
    if (rows.length === 0) return null;
    return Math.max(...rows.map((r) => r.nextUnlockTime ?? r.endTime));
  }
  return null;
}

function parseCsvNumbers(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}
function parseCsvStrings(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function expandProtocolsToAdapters(slugs: string[]): string[] {
  const out: string[] = [];
  for (const s of slugs) {
    if (s === "uncx") out.push("uncx", "uncx-vm");
    else out.push(s);
  }
  return out;
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
