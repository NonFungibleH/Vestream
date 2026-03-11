"use client";

import { VestingStream } from "@/lib/vesting/normalize";
import { Card, CardContent } from "@/components/ui/card";

function formatAmount(amount: string, decimals: number): string {
  const raw = BigInt(amount);
  const divisor = BigInt(10 ** Math.min(decimals, 18));
  const whole = raw / divisor;
  return Number(whole).toLocaleString();
}

interface SummaryByToken {
  symbol: string;
  decimals: number;
  claimable: bigint;
  thisWeek: bigint;
  locked: bigint;
}

interface UnlockSummaryProps {
  streams: VestingStream[];
}

export function UnlockSummary({ streams }: UnlockSummaryProps) {
  const now = Math.floor(Date.now() / 1000);
  const oneWeek = 7 * 24 * 60 * 60;

  const byToken: Record<string, SummaryByToken> = {};

  for (const stream of streams) {
    if (!byToken[stream.tokenSymbol]) {
      byToken[stream.tokenSymbol] = {
        symbol: stream.tokenSymbol,
        decimals: stream.tokenDecimals,
        claimable: 0n,
        thisWeek: 0n,
        locked: 0n,
      };
    }
    const t = byToken[stream.tokenSymbol];
    t.claimable += BigInt(stream.claimableNow);
    t.locked += BigInt(stream.lockedAmount);
    if (
      stream.nextUnlockTime &&
      stream.nextUnlockTime - now <= oneWeek &&
      stream.nextUnlockTime > now
    ) {
      t.thisWeek += BigInt(stream.lockedAmount);
    }
  }

  const tokens = Object.values(byToken);

  function renderStat(label: string, getValue: (t: SummaryByToken) => bigint, color?: string) {
    const nonZero = tokens.filter((t) => getValue(t) > 0n);
    if (nonZero.length === 0) {
      return <p className="text-2xl font-bold text-muted-foreground">—</p>;
    }
    return (
      <div className={`space-y-1 ${color ?? ""}`}>
        {nonZero.map((t) => (
          <p key={t.symbol} className="text-2xl font-bold">
            {formatAmount(getValue(t).toString(), t.decimals)}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {t.symbol}
            </span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-2">Claimable Now</p>
          {renderStat("claimable", (t) => t.claimable, "text-green-600")}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-2">Unlocking This Week</p>
          {renderStat("thisWeek", (t) => t.thisWeek)}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-2">Total Locked</p>
          {renderStat("locked", (t) => t.locked)}
        </CardContent>
      </Card>
    </div>
  );
}
