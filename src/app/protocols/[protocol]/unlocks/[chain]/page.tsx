// /protocols/[slug]/unlocks/[chain] — chain-filtered protocol unlock
// calendar. The chain segment accepts a numeric chain id ("1", "8453") or
// a short slug ("ethereum", "base") — see parseChainParam in ../view.tsx.
//
// Why a path segment instead of the old ?chain= query param (2026-06-12):
// reading `searchParams` is a request-time API that silently made the
// whole route dynamic, killing its ISR and running the heavy unlock query
// per request. As a path segment, every (protocol, chain) variant is its
// own on-demand ISR route — rendered once an hour in the background,
// served instantly from cache the rest of the time. Legacy ?chain= URLs
// 308-redirect here via src/middleware.ts.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProtocol, listProtocols } from "@/lib/protocol-constants";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { ProtocolUnlocksView, parseChainParam } from "../view";

// Same cadence as the unfiltered base page.
export const revalidate = 3600;

// REQUIRED for ISR on this canary: without static-params samples,
// `await params` counts as a request-time API and the route renders
// per-request. Full (protocol × chain) matrix — ~30 small pages.
export function generateStaticParams() {
  return listProtocols().flatMap((p) =>
    p.chainIds.map((cid) => ({ protocol: p.slug, chain: String(cid) })),
  );
}

interface PageParams {
  params: Promise<{ protocol: string; chain: string }>;
}

function resolve(protocol: string, chain: string) {
  const meta = getProtocol(protocol);
  if (!meta || meta.disabled) return null;
  const chainId = parseChainParam(chain);
  // Only chains this protocol actually runs on — anything else 404s rather
  // than rendering a confusing always-empty calendar. (Widen the readonly
  // SupportedChainId[] to number[] for the membership test — parseChainParam
  // returns a plain number by design, so unknown ids fall out here.)
  if (!chainId || !(meta.chainIds as readonly number[]).includes(chainId)) return null;
  return { meta, chainId };
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { protocol, chain } = await params;
  const resolved = resolve(protocol, chain);
  if (!resolved) return { title: "Not found" };
  const { meta, chainId } = resolved;

  const chainName = CHAIN_NAMES[chainId as keyof typeof CHAIN_NAMES] ?? `chain ${chainId}`;
  const title = `${meta.name} Unlocks on ${chainName} — Unlock Calendar | Vestream`;
  const description = `Live calendar of upcoming ${meta.name} token unlocks on ${chainName} — per-token amounts, dates, and recipient counts.`;
  // Canonical uses the numeric-id form so slug aliases ("ethereum") don't
  // split indexing across duplicate URLs.
  const url = `https://www.vestream.io/protocols/${meta.slug}/unlocks/${chainId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph:  { title, description, url, siteName: "Vestream", type: "website" },
    twitter:    { card: "summary_large_image", title, description },
  };
}

export default async function ProtocolUnlocksChainPage({ params }: PageParams) {
  const { protocol, chain } = await params;
  const resolved = resolve(protocol, chain);
  if (!resolved) notFound();

  return <ProtocolUnlocksView meta={resolved.meta} filterChainId={resolved.chainId} />;
}
