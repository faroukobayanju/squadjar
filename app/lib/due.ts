// Pure, no imports, so `node lib/due.check.ts` runs it directly.
type Period = "Demo" | "Weekly" | "Monthly";

const DAY = 86_400_000;
const WAT = 3_600_000; // Africa/Lagos is fixed UTC+1, no daylight saving

/**
 * Round 1's deadline anchor in epoch seconds: the next chosen weekday (0 = Sunday) or month day (1 to 28)
 * at `hour`:00 Nigeria time (WAT), at least 24h after `now`, whatever zone the device is in. Demo squads return 0.
 */
export function nextDue(period: Period, pick: { weekday?: number; monthDay?: number; hour: number }, now: Date): number {
  if (period === "Demo") return 0;
  // Work on the WAT wall clock: shift by +1h and read it with the UTC getters, so the device zone never matters.
  const wall = now.getTime() + WAT;
  const min = wall + DAY;
  const w = new Date(wall);
  const d = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), pick.hour));
  if (period === "Weekly") {
    d.setUTCDate(d.getUTCDate() + (((pick.weekday ?? 5) - d.getUTCDay() + 7) % 7));
    while (d.getTime() < min) d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCDate(pick.monthDay ?? 25); // capped at 28, so setUTCMonth never overflows
    while (d.getTime() < min) d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return Math.floor((d.getTime() - WAT) / 1000);
}
