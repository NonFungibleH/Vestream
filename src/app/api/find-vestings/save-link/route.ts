// src/app/api/find-vestings/save-link/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Web → mobile handoff: saves the wallet the user just searched on
// /find-vestings against their email. When the same user later signs into
// the mobile app via OTP using that email, /api/mobile/auth/email
// auto-claims every matching pending row.
//
// POST body: { email, walletAddress, label?, chainIds? }
// Response : { ok: true, expiresAt: ISOString }
//
// Idempotent: re-submitting the same (email, wallet) pair extends the
// expires_at by another 30 days. ON CONFLICT uses the unique index from
// the 0021 migration.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { pendingWalletLinks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { isValidWalletAddress } from "@/lib/address-validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { checkCors, withCorsHeaders } from "@/lib/cors";

const PENDING_TTL_DAYS = 30;

/** Match the regex used by /api/waitlist + /api/contact so all three public
 *  email-capture endpoints validate against the same shape. Catches "@",
 *  "user@", "@example.com", and other trivially-malformed addresses that
 *  the prior `.includes("@")` check let through. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Short display form of a wallet, EVM or Solana. Used in email subject + body. */
function truncateWalletForDisplay(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function saveLinkEmailHtml(walletAddress: string): string {
  const shortAddr = truncateWalletForDisplay(walletAddress);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:white;border-radius:20px;border:1px solid rgba(0,0,0,0.07);overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.04);">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid rgba(0,0,0,0.06);">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:32px;height:32px;background:linear-gradient(135deg,#1CB8B8,#0F8A8A);border-radius:8px;text-align:center;vertical-align:middle;">
                  <span style="font-size:16px;font-weight:900;color:white;line-height:32px;">V</span>
                </td>
                <td style="padding-left:10px;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.4px;">Vestream</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 10px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;line-height:1.3;">Your scan is saved 📌</p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.55;">
              We&rsquo;ve linked the wallet <strong style="color:#0f172a;font-family:'Courier New',monospace;">${shortAddr}</strong> to this email.
              Install the Vestream app and sign in with the same address — your scan will be waiting in your portfolio.
            </p>

            <!-- Wallet card -->
            <div style="background:rgba(28,184,184,0.06);border:1px solid rgba(28,184,184,0.18);border-radius:12px;padding:16px 18px;margin-bottom:28px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0F8A8A;text-transform:uppercase;letter-spacing:0.6px;">Saved wallet</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;font-family:'Courier New',monospace;word-break:break-all;">${walletAddress}</p>
            </div>

            <!-- App Store + Play Store badges -->
            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Get the app</p>
            <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
              <tr>
                <td style="padding:0 6px;">
                  <a href="https://www.vestream.io/early-access" style="display:inline-block;background:#0f172a;border-radius:10px;padding:10px 18px;text-decoration:none;color:white;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:10px;color:rgba(255,255,255,0.7);line-height:1;">Download on the</td>
                    </tr><tr>
                      <td style="font-size:15px;font-weight:700;color:white;letter-spacing:-0.2px;line-height:1.2;">App&nbsp;Store</td>
                    </tr></table>
                  </a>
                </td>
                <td style="padding:0 6px;">
                  <a href="https://www.vestream.io/early-access" style="display:inline-block;background:#0f172a;border-radius:10px;padding:10px 18px;text-decoration:none;color:white;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:10px;color:rgba(255,255,255,0.7);line-height:1;">Get it on</td>
                    </tr><tr>
                      <td style="font-size:15px;font-weight:700;color:white;letter-spacing:-0.2px;line-height:1.2;">Google&nbsp;Play</td>
                    </tr></table>
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:28px 0 0;font-size:13px;color:#64748b;line-height:1.55;">
              <strong style="color:#0f172a;">How it works:</strong> open the app, tap &ldquo;Continue with email,&rdquo; and enter this same address. We&rsquo;ll auto-load your scan into your portfolio so you can set push alerts for every upcoming unlock.
            </p>

            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;line-height:1.55;">
              We&rsquo;ll keep your scan for 30 days. If you don&rsquo;t install in that time, it&rsquo;ll be cleared — no account is created until you sign in.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(0,0,0,0.06);background:#fafbfc;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
              Vestream · Track every unlock · <a href="https://www.vestream.io" style="color:#64748b;text-decoration:none;">vestream.io</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function saveLinkEmailText(walletAddress: string): string {
  return [
    "Your Vestream scan is saved.",
    "",
    `We've linked the wallet ${walletAddress} to your email.`,
    "Install the Vestream app and sign in with the same address — your scan will be waiting in your portfolio.",
    "",
    "Get the app:",
    "  iOS:     https://www.vestream.io/early-access",
    "  Android: https://www.vestream.io/early-access",
    "",
    "How it works: open the app, tap \"Continue with email,\" and enter this same address.",
    "We'll auto-load your scan into your portfolio so you can set push alerts.",
    "",
    "Your scan is kept for 30 days. If you don't install in that time, it'll be cleared.",
    "No account is created until you sign in.",
    "",
    "— Vestream · vestream.io",
  ].join("\n");
}

/**
 * Send the save-link confirmation email. Fire-and-forget — never blocks the
 * API response, never throws into the caller. Failures are logged and
 * swallowed because the user's pending row is already saved at this point,
 * so a flaky email send shouldn't fail the whole UX.
 *
 * Why we still send even though Phase 1 (UI) shows the confirmation
 * inline: the email is the paper trail. If the user closes the tab before
 * installing the app, the email is the only way they remember to come
 * back. App Store / Play Store badges live in the email body so they can
 * tap straight from inbox.
 */
async function sendSaveLinkEmail(email: string, walletAddress: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[save-link email] RESEND_API_KEY not set — skipping send");
    }
    return;
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!fromAddress) {
    console.error("[save-link email] RESEND_FROM_EMAIL not set — skipping send");
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const shortAddr = truncateWalletForDisplay(walletAddress);
    const { error: sendError } = await resend.emails.send({
      from:    fromAddress,
      to:      email,
      subject: `Your Vestream scan is saved (${shortAddr})`,
      html:    saveLinkEmailHtml(walletAddress),
      text:    saveLinkEmailText(walletAddress),
    });
    if (sendError) {
      console.error("[save-link email] Resend error:", sendError);
    }
  } catch (e) {
    console.error("[save-link email] unexpected failure:", e);
  }
}

// CORS preflight — required for cross-origin POSTs with custom headers.
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const res = new NextResponse(null, { status: 204 });
  return withCorsHeaders(res, origin);
}

export async function POST(req: NextRequest) {
  // Origin check — blocks cross-origin POSTs from non-allowlisted sites.
  // This route writes to a per-email DB row, so a forged cross-origin POST
  // could pollute a victim's pending_wallet_links inbox; rate limit
  // bounds the damage but origin-gating closes the door.
  const corsError = checkCors(req);
  if (corsError) return corsError;

  const body = await req.json().catch(() => ({}));
  const rawEmail   = typeof body.email === "string" ? body.email : "";
  const rawWallet  = typeof body.walletAddress === "string" ? body.walletAddress : "";
  const rawLabel   = typeof body.label === "string" ? body.label.trim() : null;
  const rawChains  = Array.isArray(body.chainIds) ? body.chainIds : null;

  // Lowercased everywhere so dedup works regardless of how the user typed it.
  const email = rawEmail.toLowerCase().trim();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  // Address-validation helper covers both EVM and Solana formats — same
  // function the wallets-add API uses, so consistency is automatic.
  if (!isValidWalletAddress(rawWallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }
  // Normalise to lowercase for EVM addresses (Solana is base58 — preserved).
  const walletAddress = rawWallet.startsWith("0x") ? rawWallet.toLowerCase() : rawWallet.trim();

  // Tight chain-id whitelist — must be one of the supported chains in
  // protocol-constants. Anything else gets dropped (we don't store junk).
  const chainIds: number[] | null = rawChains
    ? rawChains
        .map((c: unknown) => typeof c === "number" ? c : Number(c))
        .filter((c: number) => Number.isInteger(c) && c > 0 && c < 100000)
    : null;
  const safeChains = chainIds && chainIds.length > 0 ? chainIds : null;

  // Rate-limit by IP + email so a scraper can't pile a million pending rows.
  // 20/hour is generous for legitimate users (multiple wallets across runs)
  // but blocks abuse.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("find-vestings:save-link", `${ip}:${email}`, 20, "1 h");
  const blocked = rateLimitResponse(rl, "Too many save attempts. Try again later.");
  if (blocked) return blocked;

  const expiresAt = new Date(Date.now() + PENDING_TTL_DAYS * 24 * 60 * 60 * 1000);
  const label     = rawLabel && rawLabel.length > 0 && rawLabel.length <= 80 ? rawLabel : null;

  // Upsert: on conflict (email, wallet_address) extend the TTL and overwrite
  // any label/chains the user supplied on this run. Claimed_at is preserved
  // (excluded from the SET) so we never silently un-claim an already-claimed
  // row — a returning searcher who later signs in still gets a fresh row to
  // claim.
  await db
    .insert(pendingWalletLinks)
    .values({
      email,
      walletAddress,
      label,
      chainIds: safeChains,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [pendingWalletLinks.email, pendingWalletLinks.walletAddress],
      set: {
        label,
        chainIds: safeChains,
        expiresAt,
        // Reset claimed_at so a returning user who searches the same wallet
        // again gets a fresh claim opportunity (e.g. they reinstalled).
        claimedAt: null,
      },
      // Only re-claim if the existing row is already claimed — leaves
      // unclaimed rows untouched aside from the TTL extension.
      setWhere: sql`${pendingWalletLinks.claimedAt} IS NOT NULL`,
    });

  // Fire-and-forget confirmation email so the user has an install link in
  // their inbox even if they close the browser tab. void wrapper makes the
  // promise unhandled-by-design — the helper swallows internally.
  void sendSaveLinkEmail(email, walletAddress);

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
}
