import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";

// NOTE (2026-06-12): this file used to inject a stale-while-revalidate
// Cache-Control header on the marketing-data routes (/protocols, /unlocks,
// /token) as a workaround for force-dynamic pages having no edge caching.
// That workaround was REMOVED along with force-dynamic itself: on Next
// 16.3.0-canary.19 the framework's `private, no-cache, no-store` for
// dynamic routes overrides middleware-set Cache-Control anyway (verified
// live — dynamic routes served no-store + x-vercel-cache MISS while static
// routes kept the header), and worse, on the routes where it DID stick
// (static/ISR) it was CAPPING the framework's stronger native header
// (s-maxage={revalidate} + ~1y stale-while-revalidate) down to 60s/300s.
// The pages are now genuine ISR and emit correct cache headers natively —
// do not re-add header injection here.

// Matches /token/{chainId}/{address} where the address contains uppercase
// hex. We redirect those to the lowercase canonical form so Google
// doesn't index two variants of the same page (soft-404 / duplicate).
// `replace` is sufficient — the leading /token/{cid}/ prefix is always
// lowercase and only the address segment can introduce uppercase.
const TOKEN_PATH_UPPERCASE_RE = /^\/token\/\d+\/0x[0-9a-fA-F]*[A-F][0-9a-fA-F]*\/?$/;

// Matches the legacy ?chain= query form of the protocol unlock calendar.
// The chain filter moved from a query param to a path segment (2026-06-12)
// because reading `searchParams` in the page made the route dynamic and
// killed its ISR. Old URLs (indexed + shared) 308 to the path form.
const PROTOCOL_UNLOCKS_RE = /^\/protocols\/[^/]+\/unlocks\/?$/;

// Mirror of CHAIN_SLUG_TO_ID in app/protocols/[protocol]/unlocks/view.tsx
// (middleware can't import from app/). Numeric ids pass through directly.
const CHAIN_SLUG_TO_ID: Record<string, number> = {
  ethereum: 1,    eth: 1,    mainnet: 1,
  bsc:      56,   bnb: 56,   "bnb-chain": 56,
  polygon:  137,  matic: 137,
  base:     8453,
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Lowercase canonical for /token/{chainId}/{address} ────────────────────
  // Runs FIRST so the redirect short-circuits any other handling.
  if (TOKEN_PATH_UPPERCASE_RE.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }

  // ── Legacy ?chain= → path-segment redirect for protocol unlock pages ──────
  if (PROTOCOL_UNLOCKS_RE.test(pathname) && req.nextUrl.searchParams.has("chain")) {
    const raw = (req.nextUrl.searchParams.get("chain") ?? "").trim().toLowerCase();
    const numeric = Number(raw);
    const chainId = Number.isFinite(numeric) && numeric > 0
      ? numeric
      : CHAIN_SLUG_TO_ID[raw] ?? null;
    const url = req.nextUrl.clone();
    url.searchParams.delete("chain");
    // Unrecognised chain values just drop the filter (base calendar).
    url.pathname = chainId
      ? `${pathname.replace(/\/$/, "")}/${chainId}`
      : pathname;
    return NextResponse.redirect(url, 308);
  }

  // ── Admin gate ────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Login page itself must always be reachable — let it through immediately
    if (pathname === "/admin/login") return NextResponse.next();

    // Validate the cookie VALUE against the derived token, not just its presence.
    // Previously, any cookie named `vestr_admin` with any value would bypass this
    // gate (the API routes still did the real check, but a malformed cookie
    // would render the admin UI shell, which is a UX/info-leak hazard).
    if (!isAdminAuthorized(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      // Preserve the original path as ?next=… so the login page can send
      // the user back where they were trying to go after auth succeeds.
      // Includes the original querystring so deep-links to filtered admin
      // views survive the round-trip. Skip for the bare /admin path —
      // landing on /admin after login is the default behaviour.
      if (pathname !== "/admin") {
        url.searchParams.set("next", pathname + req.nextUrl.search);
      }
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── /api-docs — accept early access OR developer API key cookie ──────────────
  if (pathname === "/api-docs") {
    const earlyAccess = req.cookies.get("vestr_early_access");
    const apiAccess   = req.cookies.get("vestr_api_access");
    if (!earlyAccess && !apiAccess) {
      const url = req.nextUrl.clone();
      url.pathname = "/developer/portal";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── /developer/account — requires developer API key cookie ───────────────────
  if (pathname === "/developer/account") {
    const apiAccess = req.cookies.get("vestr_api_access");
    if (!apiAccess) {
      const url = req.nextUrl.clone();
      url.pathname = "/developer/portal";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── /dashboard — iron-session gate (set by QR pairing) ───────────────────────
  // The desktop dashboard is reached only after a successful QR pair from
  // the mobile app — see /api/auth/desktop-pair/poll which session.save()s
  // the iron-session cookie ("vestr_session"). Existence-check here is
  // sufficient; the cookie is encrypted so its contents can't be checked
  // from middleware, but unauthorised visitors won't have it at all.
  // Server components on /dashboard re-validate the session via getSession()
  // which decrypts and reads `address`, so a stripped cookie still gets
  // bounced.
  //
  // Path-gated EXPLICITLY (2026-06-12): this used to be the bare fall-
  // through at the bottom of the function, which was only safe while every
  // other matched route returned earlier. The matcher still includes the
  // public /protocols + /token paths (for the redirects above) — without
  // this guard they'd fall through here and bounce every visitor to /login.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const cookie = req.cookies.get("vestr_session");
    if (!cookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Auth-gated routes
    "/dashboard",
    "/dashboard/:path*",
    "/api-docs",
    "/admin",
    "/admin/:path*",
    "/developer/account",
    // Canonical-URL redirects (lowercase token addresses; legacy ?chain=
    // on protocol unlock calendars). NOT for cache headers — see the note
    // at the top of this file.
    "/protocols/:path*",
    "/token/:path*",
  ],
};
