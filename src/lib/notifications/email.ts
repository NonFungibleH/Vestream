import { Resend } from "resend";
import { VestingStream } from "@/lib/vesting/types";
import { CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";

function formatAmount(amount: string, decimals: number): string {
  const raw = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const decimal = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${decimal}`.replace(/\.?0+$/, "");
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toUTCString();
}

export async function sendEmailNotification(
  email: string,
  stream: VestingStream,
  unlockTime: Date
) {
  const amount = formatAmount(stream.totalAmount, stream.tokenDecimals);
  const hoursUntil = Math.round(
    (unlockTime.getTime() - Date.now()) / (1000 * 60 * 60)
  );
  // Capitalise protocol id for display (e.g. "sablier" → "Sablier", "team-finance" → "Team Finance")
  const protocolDisplay = stream.protocol
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const chainDisplay = CHAIN_NAMES[stream.chainId as SupportedChainId] ?? `Chain ${stream.chainId}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestr.xyz";

  const subject = `Vestream: ${amount} ${stream.tokenSymbol} unlocking in ${hoursUntil}h`;
  const body = `
Your ${amount} ${stream.tokenSymbol} from ${protocolDisplay} (${chainDisplay}) unlocks at:

${formatDate(stream.nextUnlockTime!)}

View your dashboard: ${appUrl}/dashboard

---
You're receiving this because you enabled email notifications on Vestream.
To unsubscribe, visit ${appUrl}/settings
  `.trim();

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "notifications@vestr.xyz",
      to: email,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("Failed to send email to", email, err);
    throw err;
  }
}
