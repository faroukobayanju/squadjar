// Pure: the payment record people see before letting someone in. Registry counts (trust-counting squads only)
// plus stoppedSquads, which we index for every squad.
import type { T } from "./i18n/core";

export type PayRecord = { onTime: number; late: number; missed: number; completed: number; tier: number; stoppedSquads: number };

export const ZERO_RECORD: PayRecord = { onTime: 0, late: 0, missed: 0, completed: 0, tier: 0, stoppedSquads: 0 };

/** "12 on time · 1 missed": on time always, late and missed only when there are any. */
export function recordLine(r: PayRecord, t: T): string {
  const parts = [t("recordOnTime", { n: r.onTime })];
  if (r.late) parts.push(t("recordLate", { n: r.late }));
  if (r.missed) parts.push(t("recordMissed", { n: r.missed }));
  return parts.join(" · ");
}

/** null when they never stopped paying. */
export const stoppedLine = (r: PayRecord | undefined, t: T): string | null =>
  r?.stoppedSquads ? t(r.stoppedSquads === 1 ? "stoppedInOne" : "stoppedInMany", { n: r.stoppedSquads }) : null;

/** Public squads are closed to anyone who stopped paying in any squad. Private squads are the organizer's call. */
export const blockedByRecord = (r: PayRecord): boolean => r.stoppedSquads > 0;
