// src/app/api/admin/unlocks-debug/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY diagnostic: why does the unlock-window query return data when run
// against prod from a laptop, but produce nothing inside the Vercel runtime?
//
// The /unlocks hub renders "–" for every window count and /unlocks/[range]
// renders zero rows in production, while the chain-scoped callers on
// /chains/[chain] render 20 rows each off the SAME function. Standalone against
// the same database the unscoped query returns 233 groups in 759ms. Guessing
// from the rendered HTML could not separate "slow", "throwing" and "empty", so
// this runs each variant in the real runtime and reports timing + outcome.
//
// Gated by the admin cookie OR the CRON_SECRET bearer, same as seed-diagnostic.
// Delete once the root cause is fixed.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { getUnlocksInWindow, enrichGroupsWithUsd } from "@/lib/vesting/unlock-windows";
import { publicChainIds } from "@/lib/protocol-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  return !!env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;
}

type Probe = { label: string; ms: number; groups: number | null; error: string | null };

async function probe(label: string, fn: () => Promise<number>): Promise<Probe> {
  const t = Date.now();
  try {
    const groups = await fn();
    return { label, ms: Date.now() - t, groups, error: null };
  } catch (err) {
    return { label, ms: Date.now() - t, groups: null, error: String(err).slice(0, 300) };
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  const probes: Probe[] = [];

  // 1. Unscoped — the variant the /unlocks pages use.
  probes.push(await probe("unscoped 7d pool1000", async () =>
    (await getUnlocksInWindow(now, now + 7 * 86_400, 1000)).groups.length));

  // 2. Chain-scoped — the variant the working /chains pages use.
  const chains = publicChainIds();
  probes.push(await probe(`scoped 7d pool300 chain ${chains[0]}`, async () =>
    (await getUnlocksInWindow(now, now + 7 * 86_400, 300, undefined, [chains[0]])).groups.length));

  // 3. Full per-chain fan-out — what the table now does.
  probes.push(await probe(`fanout 30d pool300 x${chains.length}`, async () => {
    let total = 0;
    for (const c of chains) {
      const w = await getUnlocksInWindow(now, now + 30 * 86_400, 300, undefined, [c]);
      total += w.groups.length;
    }
    return total;
  }));

  // 4. Pricing step, on whatever the fan-out found.
  probes.push(await probe("pricing (liveFallback:false)", async () => {
    const w = await getUnlocksInWindow(now, now + 7 * 86_400, 300, undefined, [chains[0]]);
    const priced = await enrichGroupsWithUsd(w.groups, { redis: false, liveFallback: false });
    return priced.length;
  }));

  return NextResponse.json({
    now: new Date().toISOString(),
    chains,
    probes,
  });
}
