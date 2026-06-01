"use client";
import { useState, useEffect } from "react";

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function PhoneClock() {
  const [time, setTime] = useState<{
    day: string; date: number; month: string; h: string; m: string;
  } | null>(null);

  useEffect(() => {
    function tick() {
      const d = new Date();
      setTime({
        day:   DAYS[d.getDay()],
        date:  d.getDate(),
        month: MONTHS[d.getMonth()],
        h:     d.getHours().toString().padStart(2, "0"),
        m:     d.getMinutes().toString().padStart(2, "0"),
      });
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center" style={{ color: "white", paddingTop: 22 }}>
      <div
        className="inline-flex items-center justify-center gap-1"
        style={{ fontSize: 11, opacity: 0.7, fontWeight: 500, letterSpacing: "0.02em" }}
      >
        <svg width="8" height="9" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="5" width="6" height="5" rx="1" />
          <path d="M3.4 5V3.5a1.6 1.6 0 0 1 3.2 0V5" />
        </svg>
        <span suppressHydrationWarning>
          {time ? `${time.day}, ${time.date} ${time.month}` : "Sunday, 1 June"}
        </span>
      </div>
      <div
        suppressHydrationWarning
        style={{ fontSize: 70, fontWeight: 300, letterSpacing: "-0.06em", lineHeight: 1, marginTop: 4 }}
      >
        {time ? `${time.h}:${time.m}` : "9:41"}
      </div>
    </div>
  );
}
