type Period = "Demo" | "Weekly" | "Monthly";

export type Draft = { name?: string; contribution?: number; size?: number; period?: Period; weekday?: number };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// ponytail: local pattern parse stands in for the Kimi draft agent (Plan 3) so the form works offline.
// It covers "8 of us, 5k every Friday", "₦2,000 monthly for 6 people", "10 people 3000 weekly".
export function parseDraft(text: string): Draft {
  const t = text.toLowerCase().replace(/,/g, "");
  const d: Draft = {};
  const size = t.match(/(\d{1,2})\s*(?:of us|people|persons|members|pple|heads)/);
  if (size) d.size = Number(size[1]);
  const money = t.match(/(?:₦|n|naira\s*)?(\d+(?:\.\d+)?)\s*(k|thousand)?\b(?!\s*(?:of us|people|persons|members|pple|heads))/g);
  if (money) {
    for (const m of money) {
      const mm = m.match(/(\d+(?:\.\d+)?)\s*(k|thousand)?/);
      if (!mm) continue;
      const v = Number(mm[1]) * (mm[2] ? 1000 : 1);
      if (v >= 100) {
        d.contribution = v;
        break;
      }
    }
  }
  if (/month/.test(t)) d.period = "Monthly";
  else if (/week|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(t)) d.period = "Weekly";
  const day = DAYS.findIndex((x) => t.includes(x));
  if (day >= 0) d.weekday = day; // 0 = Sunday, like Date.getDay()
  const name = text.match(/(?:called|name it|named)\s+["“]?([^"”,.]+)/i);
  if (name) d.name = name[1].trim();
  return d;
}
