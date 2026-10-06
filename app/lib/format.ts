import type { T } from "./i18n/core";

export function naira(n: number) {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** "2d 4h", "17m", "40s"; two units max so it reads at a glance. */
export function countdown(ms: number, t: T) {
  if (ms <= 0) return t("cdNow");
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return t("cdDays", { d, h });
  if (h) return t("cdHours", { h, m });
  if (m) return t("cdMins", { m, s: s % 60 });
  return t("cdSecs", { s });
}

// Every user-facing date and time is Nigeria time (WAT, UTC+1), whatever zone the viewer's device is in.
// Names come from the viewer's language ("yo-NG"), falling back to en-NG where the device lacks it.
const cache = new Map<string, Intl.DateTimeFormat>();
function wat(kind: "due" | "time" | "date", lang: string) {
  const k = `${kind}:${lang}`;
  let f = cache.get(k);
  if (!f) {
    const o: Intl.DateTimeFormatOptions =
      kind === "due" ? { weekday: "short", hour: "numeric", minute: "2-digit" } : kind === "time" ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", day: "numeric", month: "short" };
    f = new Intl.DateTimeFormat([`${lang}-NG`, "en-NG"], { ...o, timeZone: "Africa/Lagos" });
    cache.set(k, f);
  }
  return f;
}

/** "Fri, 6:00 pm" */
export const dueLabel = (at: number, lang = "en") => wat("due", lang).format(at);
/** "6:00 pm" */
export const timeLabel = (at: number, lang = "en") => wat("time", lang).format(at);
/** "Today", "Yesterday" (the given words), else "Fri, 9 Oct"; days counted on the WAT calendar. */
export function dayLabel(at: number, now = Date.now(), lang = "en", words: [today: string, yesterday: string] = ["Today", "Yesterday"]) {
  const WAT_MS = 3_600_000;
  const days = Math.floor((now + WAT_MS) / 86_400_000) - Math.floor((at + WAT_MS) / 86_400_000);
  return days === 0 ? words[0] : days === 1 ? words[1] : wat("date", lang).format(at);
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
