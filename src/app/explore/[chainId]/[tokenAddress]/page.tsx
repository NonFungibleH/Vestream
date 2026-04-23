// src/app/explore/[chainId]/[tokenAddress]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Legacy Pro-gated token explorer route. Superseded by the public DexTools-style
// page at /token/[chainId]/[address] — both were drifting into near-identical
// 600-line client components.
//
// Kept as a 308 permanent redirect so:
//   - External / bookmarked links still resolve
//   - Any Google-indexed pages transfer their SEO juice to the new canonical URL
//   - Crawlers promote /token/* as the one true token page
//
// Delete this file entirely once the redirect has been in place long enough
// that analytics shows no meaningful hits to /explore/*.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface Params {
  chainId: string;
  tokenAddress: string;
}

export default async function LegacyExploreRedirect({
  params,
}: {
  params: Promise<Params>;
}) {
  const { chainId, tokenAddress } = await params;

  // Basic shape validation — if the URL is malformed, send to the
  // find-vestings search page rather than producing a broken /token/ URL.
  const chainIdNum = Number.parseInt(chainId, 10);
  const isValidChain   = Number.isFinite(chainIdNum) && chainIdNum > 0;
  const isValidAddress = /^0x[0-9a-f]{40}$/i.test(tokenAddress);

  if (!isValidChain || !isValidAddress) {
    redirect("/find-vestings");
  }

  // 308 permanent — browsers + search engines cache this and won't re-hit us.
  permanentRedirect(`/token/${chainIdNum}/${tokenAddress.toLowerCase()}`);
}
