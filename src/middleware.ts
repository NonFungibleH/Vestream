import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const cookie = req.cookies.get("vestr_early_access");
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/early-access";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/api-docs"],
};
