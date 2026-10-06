"use client";

import { useSyncExternalStore } from "react";
import { countdown } from "@/lib/format";
import { isLive } from "@/lib/live/chain";
import { useT } from "@/lib/i18n";

// Chain time minus the phone's clock, set by lib/live/clock.ts. 0 in demo mode.
// Live mode reports no time (null) until the first chain sync, so a fast or slow phone can't flip deadlines early;
// after 5s without a sync it falls back to the phone clock.
let offset = 0;
let synced = !isLive;
export function setClockOffset(ms: number) {
  offset = ms;
  synced = true;
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
    if (!synced) setTimeout(() => ((synced = true), subs.forEach((f) => f())), 5000);
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
  return useSyncExternalStore(subscribe, () => (synced ? now : null), () => null);
}

export function Countdown({ to }: { to: number }) {
  const now = useNow();
  const t = useT();
  return <span className="tnum">{now === null ? "…" : countdown(to - now, t)}</span>;
}
