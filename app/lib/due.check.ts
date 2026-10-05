import { nextDue } from "./due.ts";
import assert from "node:assert";

// Local-time constructors keep this deterministic in any timezone.
const s = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime() / 1000;
const FRI = 5;

assert.equal(nextDue("Weekly", { weekday: FRI, hour: 18 }, new Date(2026, 9, 7, 10)), s(2026, 10, 9, 18));
assert.equal(nextDue("Weekly", { weekday: FRI, hour: 18 }, new Date(2026, 9, 8, 20)), s(2026, 10, 16, 18)); // under 24h away rolls a week
assert.equal(nextDue("Monthly", { monthDay: 25, hour: 9 }, new Date(2026, 9, 3, 12)), s(2026, 10, 25, 9));
assert.equal(nextDue("Monthly", { monthDay: 25, hour: 9 }, new Date(2026, 9, 25, 8)), s(2026, 11, 25, 9)); // same day, too soon
assert.equal(nextDue("Monthly", { monthDay: 2, hour: 9 }, new Date(2026, 11, 20, 9)), s(2027, 1, 2, 9)); // rolls the year
assert.equal(nextDue("Demo", { hour: 18 }, new Date(2026, 9, 3)), 0);
console.log("due ok");
