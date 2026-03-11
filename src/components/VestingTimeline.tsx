"use client";

import { VestingStream } from "@/lib/vesting/normalize";
import { StreamCard } from "./StreamCard";
import { useState } from "react";
import { Button } from "./ui/button";

const ONE_DAY = 86400;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_MONTH = 30 * ONE_DAY;

function getBucket(stream: VestingStream): string {
  if (stream.isFullyVested && BigInt(stream.claimableNow) === 0n) return "completed";
  if (!stream.nextUnlockTime) return "completed";
  const now = Math.floor(Date.now() / 1000);
  const diff = stream.nextUnlockTime - now;
  if (diff <= ONE_DAY) return "today";
  if (diff <= ONE_WEEK) return "week";
  if (diff <= ONE_MONTH) return "month";
  return "later";
}

const BUCKET_LABELS: Record<string, string> = {
  today: "Unlocking Today",
  week: "This Week",
  month: "This Month",
  later: "Later",
  completed: "Completed",
};

const BUCKET_ORDER = ["today", "week", "month", "later", "completed"];

interface VestingTimelineProps {
  streams: VestingStream[];
  showRecipient?: boolean;
}

export function VestingTimeline({ streams, showRecipient }: VestingTimelineProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  if (streams.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No vesting streams found</p>
        <p className="text-sm mt-1">
          Add a wallet address that has active vesting on Base chain.
        </p>
      </div>
    );
  }

  const buckets: Record<string, VestingStream[]> = {};
  for (const stream of streams) {
    const bucket = getBucket(stream);
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(stream);
  }

  const completedCount = buckets["completed"]?.length ?? 0;

  return (
    <div className="space-y-8">
      {BUCKET_ORDER.filter((b) => b !== "completed").map((bucket) => {
        const items = buckets[bucket];
        if (!items || items.length === 0) return null;
        return (
          <section key={bucket}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {BUCKET_LABELS[bucket]}
            </h2>
            <div className="space-y-3">
              {items.map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  showRecipient={showRecipient}
                />
              ))}
            </div>
          </section>
        );
      })}

      {completedCount > 0 && (
        <section>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCompleted((v) => !v)}
            className="text-muted-foreground mb-3"
          >
            {showCompleted ? "Hide" : "Show"} {completedCount} completed{" "}
            {completedCount === 1 ? "stream" : "streams"}
          </Button>
          {showCompleted && (
            <div className="space-y-3 opacity-60">
              {buckets["completed"].map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  showRecipient={showRecipient}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
