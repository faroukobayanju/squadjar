// Pure, no runtime imports: node runs lib/i18n.check.ts and the record-line check against it directly.
import type { en } from "./en";

export const LANGS = ["en", "pcm", "yo", "ig", "ha"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

export type Key = keyof typeof en;
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

/** "Hi {name}" + { name: "Ada" } -> "Hi Ada". Unknown placeholders stay as they are. */
export const fmt = (s: string, vars?: Vars) => s.replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));
