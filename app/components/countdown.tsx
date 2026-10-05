"use client";

import { useSyncExternalStore } from "react";
import { countdown } from "@/lib/format";

// Chain time minus the phone's clock, set by lib/live/clock.ts. 0 in demo mode.
let offset = 0;
export function setClockOffset(ms: number) {
  offset = ms;
  if (timer) {
    now = Date.now() + offset;
    subs.forEach((f) => f());
  }
}

// One shared 1s clock for every countdown on the page.
let now: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now() + offset;
    timer = setInterval(() => {
      now = Date.now() + offset;
      subs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    subs.delete(cb);
    if (subs.size) return;
    clearInterval(timer);
    timer = undefined;
  };
}

/** Chain-adjusted Date.now(), ticking once a second; null during server render and hydration so nothing time-dependent mismatches. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now, () => null);
}

export function Countdown({ to }: { to: number }) {
  const t = useNow();
  return <span className="tnum">{t === null ? "…" : countdown(to - t)}</span>;
}
