// Server-side reminder and nudge text: Kimi writes it in the reader's language, the dictionaries are the fallback.
import { fmt, isLang, type Key, type Lang, type Vars } from "./i18n/core";
import { en } from "./i18n/en";
import { pcm } from "./i18n/pcm";
import { yo } from "./i18n/yo";
import { ig } from "./i18n/ig";
import { ha } from "./i18n/ha";
import { sql } from "./db";
import { cleanMessage } from "./kimi-draft";
import { writeMessage } from "./kimi";

const DICTS: Record<Lang, Record<Key, string>> = { en, pcm, yo, ig, ha };
export const tr = (lang: Lang, key: Key, vars?: Vars) => fmt(DICTS[lang][key], vars);

const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://squadjar.vercel.app").replace(/\/$/, "");
export const payLink = (slug: string) => `${SITE}/s/${slug}/pay`;

/** Display name and language per lowercase address; people without a profile row are left out. */
export async function people(addresses: readonly string[]): Promise<Map<string, { name: string; lang: Lang }>> {
  if (!addresses.length) return new Map();
  const rows = await sql`select address, display_name, language from users where address = any(${addresses.map((a) => a.toLowerCase())})`;
  return new Map(rows.map((r) => [r.address as string, { name: r.display_name as string, lang: isLang(r.language) ? r.language : "en" }]));
}

/** Kimi's message when it passes the copy rules and length, else the dictionary template. */
export async function compose(task: string, facts: object, lang: Lang, link: string, max: number, template: string): Promise<string> {
  return cleanMessage(await writeMessage(task, facts, lang), link, max) ?? template;
}
