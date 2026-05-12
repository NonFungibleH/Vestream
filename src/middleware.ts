import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";

// ── Marketing-data SWR caching ────────────────────────────────────────────
// These routes carry slow-changing aggregated data (protocol stats, TVL,
// upcoming unlocks, token info). Without this, framework-default
// Cache-Control was `private, no-cache, no-store` — every request hit a
// cold lambda. Setting `public, s-maxage=60, stale-while-revalidate=300`
// at the middleware layer (which runs AFTER the page render and can
// override framework headers) lets Vercel's edge cache the rendered
// HTML for 60 seconds and serve stale-while-revalidating for 5 more.
//
// User-perceived: every request after the first within any 6-minute
// window gets served from edge in <100ms. Cold renders only happen on
// the silent background revalidation, never on the user's path.
//
// Why middleware instead of next.config.ts headers(): the headers()
// config is applied at the framework layer and gets overridden by
// dynamic-rendering directives like `force-dynamic`. Middleware
// headers are set on the outgoing response regardless of what the
// framework decided, making this the load-bearing config.
const SWR_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

function isMarketingDataPath(pathname: string): boolean {
  return (
    pathname === "/protocols" ||
    pathname.startsWith("/protocols/") ||
    pathname === "/unlocks" ||
    pathname.startsWith("/unlocks/") ||
    pathname.startsWith("/token/")
  );
}

// Matches /token/{chainId}/{address} where the address contains uppercase
// hex. We redirect those to the lowercase canonical form so Google
// doesn't index two variants of the same page (soft-404 / duplicate).
// `replace` is sufficient — the leading /token/{cid}/ prefix is always
// lowercase and only the address segment can introduce uppercase.
const TOKEN_PATH_UPPERCASE_RE = /^\/token\/\d+\/0x[0-9a-fA-F]*[A-F][0-9a-fA-F]*\/?$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Lowercase canonical for /token/{chainId}/{address} ────────────────────
  // Runs FIRST so the redirect short-circuits any other handling.
  if (TOKEN_PATH_UPPERCASE_RE.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }

  // ── Marketing-data SWR cache headers ──────────────────────────────────────
  // Apply BEFORE auth gates so anonymous traffic on these routes (the SEO
  // landing pages, the unlocks calendar, token explorer) gets edge caching.
  if (isMarketingDataPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", SWR_CACHE_HEADER);
    return response;
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
  const cookie = req.cookies.get("vestr_session");
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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
    // SWR-cached marketing-data routes (Cache-Control header injection)
    "/protocols",
    "/protocols/:path*",
    "/unlocks",
    "/unlocks/:path*",
    "/token/:path*",
  ],
};
