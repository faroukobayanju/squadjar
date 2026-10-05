// Pure, no imports, so `node lib/due.check.ts` runs it directly.
type Period = "Demo" | "Weekly" | "Monthly";

const DAY = 86_400_000;

/**
 * Round 1's deadline anchor in epoch seconds: the next chosen weekday (0 = Sunday) or month day (1 to 28)
 * at `hour`:00 local time, at least 24h after `now`. Demo squads return 0 (one round length after activation).
 */
export function nextDue(period: Period, pick: { weekday?: number; monthDay?: number; hour: number }, now: Date): number {
  if (period === "Demo") return 0;
  const min = now.getTime() + DAY;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), pick.hour);
  if (period === "Weekly") {
    d.setDate(d.getDate() + (((pick.weekday ?? 5) - d.getDay() + 7) % 7));
    while (d.getTime() < min) d.setDate(d.getDate() + 7);
  } else {
    d.setDate(pick.monthDay ?? 25); // capped at 28, so setMonth never overflows
    while (d.getTime() < min) d.setMonth(d.getMonth() + 1);
  }
  return Math.floor(d.getTime() / 1000);
}
