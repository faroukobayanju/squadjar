// Pure, no runtime imports, so `node lib/kimi-draft.check.ts` runs it directly.
// Validates the Kimi draft agent's draftSquad tool arguments into the POST /api/kimi/draft reply (issue #16).
type Period = "Demo" | "Weekly" | "Monthly";
export type Due = { weekday?: number; monthDay?: number; hour: number };
export type KimiDraft = { contribution: number; size: number; period: Period; name?: string; due?: Due };
export type DraftReply = { draft: KimiDraft | null; followUp?: string; warnings: string[] };

/** The words the product never says (same list as scripts/check-copy.mjs). */
export const BANNED = /\b(wallet|crypto|token|gas|transaction|blockchain|stake|address|default)s?\b/i;
export const hasBanned = (s: string) => BANNED.test(s);

const PERIODS: readonly Period[] = ["Demo", "Weekly", "Monthly"];
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
/** One short line the screen can show as-is, or undefined. */
const line = (v: unknown, max: number) => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  return s && s.length <= max && !hasBanned(s) ? s : undefined;
};

/** Tool args (already JSON-parsed) -> reply. Required fields invalid or missing: draft null (the screen falls back to the pattern parser). */
export function normalizeDraft(args: unknown): DraftReply {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const followUp = line(a.followUp, 200);
  const warnings = (Array.isArray(a.warnings) ? a.warnings : []).map((w) => line(w, 160)).filter((w): w is string => !!w).slice(0, 3);
  const reply = (draft: KimiDraft | null): DraftReply => (followUp ? { draft, followUp, warnings } : { draft, warnings });

  const contribution = int(a.contribution, 100, 10_000_000);
  const size = int(a.size, 3, 20);
  const period = PERIODS.find((p) => p === a.period);
  if (contribution === undefined || size === undefined || !period) return reply(null);

  const draft: KimiDraft = { contribution, size, period };
  const name = line(a.name, 40);
  if (name) draft.name = name;
  const d = (a.due && typeof a.due === "object" ? a.due : {}) as Record<string, unknown>;
  const hour = int(d.hour, 0, 23);
  // Defaults match the form's (Weekly 6pm, Monthly 9am), so a day without a time still preselects.
  if (period === "Weekly") {
    const weekday = int(d.weekday, 0, 6);
    if (weekday !== undefined) draft.due = { weekday, hour: hour ?? 18 };
  } else if (period === "Monthly") {
    const monthDay = int(d.monthDay, 1, 28);
    if (monthDay !== undefined) draft.due = { monthDay, hour: hour ?? 9 };
  }
  return reply(draft);
}

/** Kimi's free text, or null when it breaks the rules (banned word, too long, no pay link). Adds the link when it fits. */
export function cleanMessage(text: unknown, link: string, max: number): string | null {
  if (typeof text !== "string") return null;
  let s = text.trim().replace(/^["“]|["”]$/g, "").trim();
  if (!s || hasBanned(s)) return null;
  if (!s.includes(link)) s = `${s} ${link}`;
  return s.length <= max ? s : null;
}
