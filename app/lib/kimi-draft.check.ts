import assert from "node:assert";
import { cleanMessage, normalizeDraft } from "./kimi-draft.ts";
import { nudgeKey, stageAt, toNudge } from "./nudge-plan.ts";

// Acceptance (#16): "8 of us, 5k every Friday" and the Pidgin "We be 8, 5k every Friday", as draftSquad tool args.
const friday = { draft: { contribution: 5000, size: 8, period: "Weekly", due: { weekday: 5, hour: 18 } }, warnings: [] };
assert.deepStrictEqual(normalizeDraft({ contribution: 5000, size: 8, period: "Weekly", due: { weekday: 5 } }), friday);
assert.deepStrictEqual(normalizeDraft({ contribution: 5000, size: 8, period: "Weekly", due: { weekday: 5, hour: 18 }, warnings: [] }), friday);

// Required fields: out of range, fractional or missing -> null, follow-up kept.
assert.deepStrictEqual(normalizeDraft({ contribution: 50, size: 8, period: "Weekly" }), { draft: null, warnings: [] });
assert.strictEqual(normalizeDraft({ contribution: 5000.5, size: 8, period: "Weekly" }).draft, null);
assert.strictEqual(normalizeDraft({ contribution: 5000, size: 2, period: "Weekly" }).draft, null);
assert.strictEqual(normalizeDraft({ contribution: 5000, size: 21, period: "Weekly" }).draft, null);
assert.strictEqual(normalizeDraft({ contribution: 5000, size: 8, period: "Daily" }).draft, null);
assert.strictEqual(normalizeDraft(null).draft, null);
assert.deepStrictEqual(normalizeDraft({ size: 8, followUp: "How much does each person pay?" }), { draft: null, followUp: "How much does each person pay?", warnings: [] });

// Optional fields: bad ones are dropped, the draft survives.
assert.deepStrictEqual(normalizeDraft({ contribution: 2000, size: 6, period: "Monthly", due: { monthDay: 31, hour: 9 }, name: "x".repeat(41) }).draft, { contribution: 2000, size: 6, period: "Monthly" });
assert.deepStrictEqual(normalizeDraft({ contribution: 2000, size: 6, period: "Monthly", due: { monthDay: 25, hour: 24 } }).draft?.due, { monthDay: 25, hour: 9 });
assert.strictEqual(normalizeDraft({ contribution: 2000, size: 6, period: "Monthly", due: { weekday: 5 } }).draft?.due, undefined);
assert.strictEqual(normalizeDraft({ contribution: 2000, size: 6, period: "Demo", due: { weekday: 5, hour: 1 } }).draft?.due, undefined);
assert.strictEqual(normalizeDraft({ contribution: 2000, size: 6, period: "Weekly", name: "  CSC 300L  Squad " }).draft?.name, "CSC 300L Squad");

// Banned words never reach the screen.
const r = normalizeDraft({ contribution: 5000, size: 8, period: "Weekly", name: "Crypto Kings", followUp: "Connect your wallet?", warnings: ["Gas is free", "₦5,000 is a lot for students"] });
assert.deepStrictEqual(r, { draft: { contribution: 5000, size: 8, period: "Weekly" }, warnings: ["₦5,000 is a lot for students"] });

// Free-text messages: banned or too long -> null (template), missing link appended.
const link = "https://squadjar.vercel.app/s/csc/pay";
assert.strictEqual(cleanMessage("Pay your contribution, Ada", link, 280), `Pay your contribution, Ada ${link}`);
assert.strictEqual(cleanMessage(`"Pay here ${link}"`, link, 280), `Pay here ${link}`);
assert.strictEqual(cleanMessage("Send tokens now", link, 280), null);
assert.strictEqual(cleanMessage("x".repeat(260), link, 280), null);
assert.strictEqual(cleanMessage(undefined, link, 280), null);
// Only our pay link may appear.
assert.strictEqual(cleanMessage(`Pay here ${link} or at https://evil.example/pay`, link, 280), null);
assert.strictEqual(cleanMessage(`Pay at http://x.ng`, link, 280), null);
assert.strictEqual(cleanMessage(`Pay at www.paystack-help.ng`, link, 280), null);
assert.strictEqual(cleanMessage(`Quick: bit.ly/abc ${link}`, link, 280), null);
assert.strictEqual(cleanMessage(`See x.com for news. ${link}`, link, 280), null);
assert.strictEqual(cleanMessage(`Ada, Bola: ₦5,000 is due Fri, 6:00 pm. ${link}`, link, 280), `Ada, Bola: ₦5,000 is due Fri, 6:00 pm. ${link}`);

// Nudge stages (epoch seconds). Weekly: T-24h, T-1h, missed during grace, nothing after.
const D = 1_000_000;
assert.strictEqual(stageAt("Weekly", D, 43_200, D - 90_000), null);
assert.strictEqual(stageAt("Weekly", D, 43_200, D - 86_400), "t24h");
assert.strictEqual(stageAt("Weekly", D, 43_200, D - 3_601), "t24h");
assert.strictEqual(stageAt("Weekly", D, 43_200, D - 3_600), "t1h");
assert.strictEqual(stageAt("Weekly", D, 43_200, D + 1), "missed");
assert.strictEqual(stageAt("Weekly", D, 43_200, D + 43_201), null);
// Demo: T-2m, T-30s, missed.
assert.strictEqual(stageAt("Demo", D, 60, D - 121), null);
assert.strictEqual(stageAt("Demo", D, 60, D - 100), "t24h");
assert.strictEqual(stageAt("Demo", D, 60, D - 20), "t1h");
assert.strictEqual(stageAt("Demo", D, 60, D + 30), "missed");

// Dedup: one per (member, squad, round, stage, channel), case-insensitive addresses.
assert.strictEqual(nudgeKey("0xAB", "0xCD", 2, "t1h"), "0xab:0xcd:2:t1h:inapp");
const sent = new Set([nudgeKey("0xaa", "0xsq", 2, "t1h")]);
assert.deepStrictEqual(toNudge(["0xAA", "0xbb"], "0xSQ", 2, "t1h", sent), ["0xbb"]);
assert.deepStrictEqual(toNudge(["0xaa", "0xbb"], "0xsq", 2, "missed", sent), ["0xaa", "0xbb"]);
assert.deepStrictEqual(toNudge(["0xaa"], "0xsq", 3, "t1h", sent), ["0xaa"]);
console.log("kimi-draft ok");
