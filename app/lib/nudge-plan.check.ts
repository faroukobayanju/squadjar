import assert from "node:assert";
import { nudgeKey, stageAt, toNudge } from "./nudge-plan.ts";

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
console.log("nudge-plan ok");
