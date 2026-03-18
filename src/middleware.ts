import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin gate ────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Login page itself must always be reachable — let it through immediately
    if (pathname === "/admin/login") return NextResponse.next();

    const adminCookie = req.cookies.get("vestr_admin");
    if (!adminCookie) {
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

  // ── /dashboard — early access gate only ──────────────────────────────────────
  const cookie = req.cookies.get("vestr_early_access");
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/early-access";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/api-docs",
    "/admin",
    "/admin/:path*",
    "/developer/account",
  ],
};
