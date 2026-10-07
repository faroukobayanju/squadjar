// Pure, no runtime imports, so `node lib/nudge-plan.check.ts` runs it directly.
// Which pay nudge (if any) an Active squad's unpaid members get right now, and which of those were already sent.
export type Stage = "t24h" | "t1h" | "missed";

// Seconds before the round deadline. Demo rounds are 5 minutes, so they nudge at T-2m and T-30s.
const WINDOWS = { Demo: [120, 30], Weekly: [86_400, 3_600], Monthly: [86_400, 3_600] } as const;

/**
 * t24h inside the early window, t1h inside the late one, missed once the deadline has passed while the grace
 * window is still open (the last moment paying still counts). null otherwise. All times in epoch seconds.
 */
export function stageAt(period: keyof typeof WINDOWS, deadline: number, grace: number, now: number): Stage | null {
  const [early, late] = WINDOWS[period];
  const left = deadline - now;
  if (left <= 0) return now <= deadline + grace ? "missed" : null;
  if (left <= late) return "t1h";
  if (left <= early) return "t24h";
  return null;
}

/** Matches the notifications primary key (member, squad, round, stage, channel). */
export const nudgeKey = (member: string, squad: string, round: number, stage: Stage, channel = "inapp") =>
  [member.toLowerCase(), squad.toLowerCase(), round, stage, channel].join(":");

/** Members still owed this nudge: unpaid and not yet in `sent` (keys from nudgeKey). */
export const toNudge = (unpaid: readonly string[], squad: string, round: number, stage: Stage, sent: ReadonlySet<string>) =>
  unpaid.filter((m) => !sent.has(nudgeKey(m, squad, round, stage)));
