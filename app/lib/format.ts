export function naira(n: number) {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** "2d 4h", "17m", "40s"; two units max so it reads at a glance. */
export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function dueLabel(at: number) {
  return new Date(at).toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** Which of the four ink masks a stamp uses, stable per member and round. */
export function inkVariant(id: string, round: number) {
  return `ink-${(Math.abs(stampTilt(id, round)) % 4) + 1}`;
}

/** Stable pseudo-random rotation per member and round so stamps look hand-pressed. */
export function stampTilt(id: string, round: number) {
  let h = round * 31;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) % 997;
  return -2 - (h % 11);
}
