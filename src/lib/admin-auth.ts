import { type NextRequest } from "next/server";

/**
 * Validate the admin session cookie.
 * The cookie value is a derivative of ADMIN_PASSWORD so it can't be guessed
 * without knowing the password, and changing the password immediately invalidates
 * all existing admin sessions.
 */
export function isAdminAuthorized(req: NextRequest): boolean {
  const cookie = req.cookies.get("vestr_admin");
  if (!cookie?.value) return false;

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const expectedToken = `vstr_admin_${Buffer.from(expected).toString("base64url").slice(0, 16)}`;
  return cookie.value === expectedToken;
}
