"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";

/** Ticks once a second; renders nothing time-dependent on the server to avoid a mismatch. */
export function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum">{now === null ? "…" : countdown(to - now)}</span>;
}
