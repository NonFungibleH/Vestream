// src/app/api/mobile/vestings/route.ts
// Reuses the same aggregate logic as /api/vesting but with mobile bearer auth
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters";
import { CHAIN_IDS } from "@/lib/vesting/types";

const ALL_CHAIN_IDS = [
  CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE
];

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userWallets = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!userWallets.length) return NextResponse.json({ streams: [] });

  const addresses = userWallets.map(w => w.address);

  const results = await Promise.allSettled(
    ALL_CHAIN_IDS.flatMap(chainId =>
      ADAPTER_REGISTRY
        .filter(a => a.supportedChainIds.includes(chainId))
        .map(a => a.fetch(addresses, chainId))
    )
  );

  const streams = results
    .flatMap(r => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => (a.nextUnlockTime ?? Infinity) - (b.nextUnlockTime ?? Infinity));

  return NextResponse.json({ streams }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
