// Pure: the payment record people see before letting someone in. Registry counts (trust-counting squads only)
// plus stoppedSquads, which we index for every squad.
export type PayRecord = { onTime: number; late: number; missed: number; completed: number; tier: number; stoppedSquads: number };

export const ZERO_RECORD: PayRecord = { onTime: 0, late: 0, missed: 0, completed: 0, tier: 0, stoppedSquads: 0 };

/** "12 on time · 1 missed": on time always, late and missed only when there are any. */
export function recordLine(r: PayRecord): string {
  const parts = [`${r.onTime} on time`];
  if (r.late) parts.push(`${r.late} late`);
  if (r.missed) parts.push(`${r.missed} missed`);
  return parts.join(" · ");
}

/** null when they never stopped paying. */
export const stoppedLine = (r: PayRecord | undefined): string | null =>
  r?.stoppedSquads ? `Stopped paying in ${r.stoppedSquads} ${r.stoppedSquads === 1 ? "squad" : "squads"}` : null;

/** Public squads are closed to anyone who stopped paying in any squad. Private squads are the organizer's call. */
export const blockedByRecord = (r: PayRecord): boolean => r.stoppedSquads > 0;

export const RECORD_BLOCKED = "You stopped paying in a squad before, so public squads are closed to you. Private squads can still invite you.";
