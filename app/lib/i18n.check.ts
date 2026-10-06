import assert from "node:assert";
import { en } from "./i18n/en.ts";
import { pcm } from "./i18n/pcm.ts";
import { yo } from "./i18n/yo.ts";
import { ig } from "./i18n/ig.ts";
import { ha } from "./i18n/ha.ts";
import { fmt } from "./i18n/core.ts";

// Every language has exactly the English keys, and the same {placeholders} in each string.
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const keys = Object.keys(en).sort();
for (const [lang, dict] of Object.entries({ pcm, yo, ig, ha }) as [string, Record<string, string>][]) {
  assert.deepStrictEqual(Object.keys(dict).sort(), keys, `${lang}: keys differ from en`);
  for (const k of keys) {
    assert.ok(dict[k].trim(), `${lang}.${k} is empty`);
    assert.strictEqual(holes(dict[k]), holes(en[k as keyof typeof en]), `${lang}.${k}: placeholders differ from en`);
  }
}

assert.strictEqual(fmt(en.homeHi, { name: "Ada" }), "Hi Ada");
assert.strictEqual(fmt(en.homeBalance), "Balance {amount}"); // left for rich() to fill with an element
assert.strictEqual(fmt("{a}{a} {b}", { a: 1 }), "11 {b}");
console.log("i18n ok");
