import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  const res = NextResponse.json({ ok: true });
  // Clear the readable Pro-bypass companion cookie (set by middleware on
  // dashboard visits — see src/middleware.ts). Without this a logged-out user
  // would keep skipping the token-page soft-paywall until it expired.
  res.cookies.set("vestr_pro", "", { path: "/", maxAge: 0 });
  return res;
}
