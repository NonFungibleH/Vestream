"use client";

import { VestingStream } from "@/lib/vesting/normalize";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function formatAmount(amount: string, decimals: number): string {
  const raw = BigInt(amount);
  const divisor = BigInt(10 ** Math.min(decimals, 18));
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const decStr = remainder.toString().padStart(decimals, "0").slice(0, 2);
  return `${Number(whole).toLocaleString()}.${decStr}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function timeUntil(timestamp: number): string {
  const diff = timestamp - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `in ${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

interface StreamCardProps {
  stream: VestingStream;
  showRecipient?: boolean;
}

export function StreamCard({ stream, showRecipient }: StreamCardProps) {
  const total = BigInt(stream.totalAmount);
  const withdrawn = BigInt(stream.withdrawnAmount);
  const claimable = BigInt(stream.claimableNow);
  const locked = BigInt(stream.lockedAmount);

  const withdrawnPct = total > 0n ? Number((withdrawn * 1000n) / total) / 10 : 0;
  const claimablePct = total > 0n ? Number((claimable * 1000n) / total) / 10 : 0;

  const protocol = stream.protocol === "sablier" ? "Sablier" : "Hedgey";

  return (
    <Card className="w-full">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="font-semibold text-lg">
              {formatAmount(stream.totalAmount, stream.tokenDecimals)}{" "}
              {stream.tokenSymbol}
            </span>
            {showRecipient && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {stream.recipient.slice(0, 6)}...{stream.recipient.slice(-4)}
              </p>
            )}
          </div>
          <Badge variant="secondary">{protocol}</Badge>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3 flex">
          <div
            className="h-full bg-muted-foreground/40"
            style={{ width: `${withdrawnPct}%` }}
            title={`Claimed: ${formatAmount(stream.withdrawnAmount, stream.tokenDecimals)}`}
          />
          <div
            className="h-full bg-green-500"
            style={{ width: `${claimablePct}%` }}
            title={`Claimable: ${formatAmount(stream.claimableNow, stream.tokenDecimals)}`}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground mb-3">
          <span>
            {claimable > 0n && (
              <span className="text-green-600 font-medium">
                {formatAmount(stream.claimableNow, stream.tokenDecimals)}{" "}
                {stream.tokenSymbol} claimable
              </span>
            )}
            {claimable === 0n && locked > 0n && (
              <span>
                {formatAmount(stream.lockedAmount, stream.tokenDecimals)}{" "}
                {stream.tokenSymbol} locked
              </span>
            )}
            {stream.isFullyVested && locked === 0n && (
              <span className="text-muted-foreground">Fully vested</span>
            )}
          </span>
          {stream.nextUnlockTime && !stream.isFullyVested && (
            <span
              className="font-medium"
              title={formatDate(stream.nextUnlockTime)}
            >
              {timeUntil(stream.nextUnlockTime)}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {stream.nextUnlockTime && !stream.isFullyVested && (
            <span>Unlocks {formatDate(stream.nextUnlockTime)}</span>
          )}
          {stream.isFullyVested && (
            <span>
              Ended{" "}
              {new Date(stream.endTime * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
