// src/lib/ssrf-guard.ts
// ─────────────────────────────────────────────────────────────────────────────
// SSRF guard for user-supplied outbound URLs — currently the developer webhook
// subscription URLs (/api/v1/webhooks, /api/developer/webhooks), which the
// webhook-deliveries cron later fetch()es server-side. Before this, those
// endpoints validated only the http(s) scheme, so a Pro-tier caller could point
// a webhook at 169.254.169.254 (cloud metadata), 127.0.0.1, or an internal
// 10.x/192.168.x service and observe delivery success (July 2026 audit, CTO
// security #4).
//
// Strategy: reject loopback/link-local/private/reserved hosts at SUBSCRIBE time
// (both literal IPs and hostnames that resolve to such addresses), and re-check
// the literal host at DELIVERY time so rows created before this guard — and any
// obvious rebind to a literal private IP — are also blocked. Full DNS-rebind-at-
// delivery hardening (re-resolve + pin) is a follow-up.
// ─────────────────────────────────────────────────────────────────────────────
import { lookup } from "dns/promises";

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;          // "this host", private, loopback
  if (a === 169 && b === 254) return true;                     // link-local incl 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;            // private
  if (a === 192 && b === 168) return true;                     // private
  if (a === 100 && b >= 64 && b <= 127) return true;           // CGNAT (100.64/10)
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;         // loopback / unspecified
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // link-local / ULA
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPrivateV4(mapped[1]);
    return false;                                              // other global IPv6 allowed
  }
  return isPrivateV4(ip);
}

/** Literal-host check — no DNS. Catches localhost, *.local/*.internal, and IP literals. */
export function isBlockedWebhookHostLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^[0-9.]+$/.test(h) || h.includes(":")) return isPrivateOrReservedIp(h); // IP literal
  return false; // real hostname — needs DNS (see assertPublicWebhookUrl)
}

/**
 * Full validation for subscribe time. Checks scheme, literal host, and resolves
 * DNS to reject hostnames that point at private/reserved addresses. Fails closed.
 */
export async function assertPublicWebhookUrl(
  raw: string,
  opts: { requireHttps: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "URL is not valid" }; }

  if (u.protocol !== "http:" && u.protocol !== "https:")
    return { ok: false, reason: "URL must start with http:// or https://" };
  if (opts.requireHttps && u.protocol !== "https:")
    return { ok: false, reason: "Production webhooks must use https://" };

  const host = u.hostname.toLowerCase();
  if (isBlockedWebhookHostLiteral(host))
    return { ok: false, reason: "URL host is not allowed (loopback, private, or link-local address)" };

  // Real hostname → resolve and reject if ANY address is private/reserved.
  if (!/^[0-9.]+$/.test(host) && !host.includes(":")) {
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.some((a) => isPrivateOrReservedIp(a.address)))
        return { ok: false, reason: "URL host resolves to a private or reserved address" };
    } catch {
      return { ok: false, reason: "URL host could not be resolved" };
    }
  }
  return { ok: true };
}
