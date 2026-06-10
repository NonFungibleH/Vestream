import { Resend } from "resend";
import { VestingStream } from "@/lib/vesting/types";
import { CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";

type AlertTriggerType =
  | "before-unlock"
  | "vesting-start"
  | "cliff"
  | "stream-end"
  | "claim-ready"
  | "threshold";   // claimable USD value crossed the user's $N line (2026-06)

function formatAmount(amount: string, decimals: number): string {
  const raw = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const decimal = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${decimal}`.replace(/\.?0+$/, "");
}

/**
 * Formats an event timestamp in the user's local timezone when known,
 * else UTC. We use Intl.DateTimeFormat over toLocaleString so the
 * timezone string is included in the rendered output ("Mar 15, 2027
 * at 14:30 GMT-5") — readers without context can't tell from
 * "Mar 15 14:30" whether they're reading UTC or local time.
 *
 * Falsy/invalid `tz` falls back to UTC silently. Intl will throw on
 * an unrecognized timezone string; the try/catch swallows that and
 * also falls back to UTC so a bad client-side detection never blocks
 * an email send.
 */
function formatDate(timestamp: number, tz?: string | null): string {
  const d = new Date(timestamp * 1000);
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: tz ?? "UTC",
      year:     "numeric",
      month:    "short",
      day:      "numeric",
      hour:     "2-digit",
      minute:   "2-digit",
      timeZoneName: "short",
    };
    return new Intl.DateTimeFormat("en-GB", opts).format(d);
  } catch {
    return d.toUTCString();
  }
}

/**
 * Per-trigger-type subject + body copy. Returns a `{ subject, body }`
 * pair so the caller can plug it directly into Resend's send.
 *
 * The legacy "unlocking in Nh" copy is preserved for the
 * "before-unlock" trigger (the most common case). Event-type triggers
 * (cliff / stream-end / vesting-start / claim-ready) get their own
 * copy so the email reads correctly for the lifecycle event the
 * user actually subscribed to.
 */
function renderEmail(
  trigger: AlertTriggerType,
  stream: VestingStream,
  eventTime: Date,
  tz: string | null,
  appUrl: string,
  // "threshold" only — the USD line crossed + current claimable value.
  usd?: { thresholdUsd?: number; claimableUsd?: number },
): { subject: string; body: string } {
  const amount = formatAmount(stream.totalAmount, stream.tokenDecimals);
  const sym = stream.tokenSymbol;
  const protocolDisplay = stream.protocol
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const chainDisplay = CHAIN_NAMES[stream.chainId as SupportedChainId] ?? `Chain ${stream.chainId}`;
  const eventDateStr = formatDate(Math.floor(eventTime.getTime() / 1000), tz);

  const footer = `\n\n---\nYou're receiving this because you enabled email notifications on Vestream.\nTo unsubscribe, visit ${appUrl}/settings`;

  switch (trigger) {
    case "cliff":
      return {
        subject: `Vestream: ${sym} cliff reached`,
        body: `Your ${sym} from ${protocolDisplay} (${chainDisplay}) has just reached its cliff date.

Cliff date: ${eventDateStr}

Locked tokens released at the cliff are now available to claim.

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    case "stream-end":
      return {
        subject: `Vestream: ${sym} vesting complete`,
        body: `Your ${sym} vesting stream from ${protocolDisplay} (${chainDisplay}) has fully vested.

Completed: ${eventDateStr}

All remaining tokens are now available to claim.

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    case "vesting-start":
      return {
        subject: `Vestream: ${sym} vesting has started`,
        body: `Your ${sym} vesting from ${protocolDisplay} (${chainDisplay}) has started.

Start date: ${eventDateStr}

Tokens will begin unlocking on this token's schedule.

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    case "threshold": {
      const thresholdStr = usd?.thresholdUsd != null
        ? `$${Math.round(usd.thresholdUsd).toLocaleString("en-US")}`
        : "your alert threshold";
      const claimableLine = usd?.claimableUsd != null
        ? `\nClaimable now: about $${Math.round(usd.claimableUsd).toLocaleString("en-US")}\n`
        : "";
      return {
        subject: `Vestream: ${sym} passed ${thresholdStr} claimable`,
        body: `Your claimable ${sym} from ${protocolDisplay} (${chainDisplay}) has crossed ${thresholdStr}.

Crossed: ${eventDateStr}${claimableLine}
Head to your dashboard to claim.

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    }
    case "claim-ready":
      return {
        subject: `Vestream: ${sym} is now claimable`,
        body: `Your ${sym} from ${protocolDisplay} (${chainDisplay}) is now claimable.

Unlocked: ${eventDateStr}

Head to your dashboard to claim.

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    case "before-unlock":
    default: {
      const hoursUntil = Math.max(1, Math.round((eventTime.getTime() - Date.now()) / (1000 * 60 * 60)));
      return {
        subject: `Vestream: ${amount} ${sym} unlocking in ${hoursUntil}h`,
        body: `Your ${amount} ${sym} from ${protocolDisplay} (${chainDisplay}) unlocks at:

${eventDateStr}

View your dashboard: ${appUrl}/dashboard${footer}`,
      };
    }
  }
}

/**
 * Sends one notification email via Resend.
 *
 * 2026-05-20:
 *   - Brand strings fixed: defaults switched from the legacy
 *     `vestr.xyz` / `notifications@vestr.xyz` to the live brand
 *     `vestream.io` / `notifications@vestream.io`. The env-var
 *     overrides (RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL) still take
 *     precedence so production can override.
 *   - Trigger-aware copy: subject/body now vary by the alert's
 *     trigger type so "cliff reached", "vesting complete", etc.
 *     read correctly rather than the old one-size-fits-all
 *     "unlocking in Nh" subject.
 *   - Timezone-aware date formatting: the user's IANA timezone
 *     (from the new users.timezone column) is honoured when
 *     rendering the event date. Falls back to UTC if unknown.
 */
export async function sendEmailNotification(
  email: string,
  stream: VestingStream,
  eventTime: Date,
  options?: {
    trigger?: AlertTriggerType;
    timezone?: string | null;
    /** "threshold" trigger only — USD line crossed + current claimable. */
    thresholdUsd?: number;
    claimableUsd?: number;
  },
) {
  const trigger  = options?.trigger  ?? "before-unlock";
  const timezone = options?.timezone ?? null;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vestream.io";
  const fromAddr = process.env.RESEND_FROM_EMAIL  ?? "notifications@vestream.io";

  const { subject, body } = renderEmail(trigger, stream, eventTime, timezone, appUrl, {
    thresholdUsd: options?.thresholdUsd,
    claimableUsd: options?.claimableUsd,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: fromAddr,
      to: email,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("Failed to send email to", email, err);
    throw err;
  }
}
