import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.redirect(
    new URL("/developer/portal", process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io"),
    { status: 303 },
  );
  res.cookies.set("vestr_api_access", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
