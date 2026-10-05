import { nextDue } from "./due.ts";
import assert from "node:assert";

// Inputs are WAT wall-clock times written as UTC+1 instants; expected values are literal epoch seconds.
const at = (iso: string) => new Date(iso + "+01:00");
const FRI = 5;

// Fri 2026-10-09 18:00 WAT = 17:00 UTC
assert.equal(nextDue("Weekly", { weekday: FRI, hour: 18 }, at("2026-10-07T10:00:00")), 1791565200);
assert.equal(nextDue("Weekly", { weekday: FRI, hour: 18 }, at("2026-10-08T20:00:00")), 1792170000); // under 24h away rolls a week
// Sun 2026-10-25 09:00 WAT = 08:00 UTC
assert.equal(nextDue("Monthly", { monthDay: 25, hour: 9 }, at("2026-10-03T12:00:00")), 1792915200);
assert.equal(nextDue("Monthly", { monthDay: 25, hour: 9 }, at("2026-10-25T08:00:00")), 1795593600); // same day, too soon
assert.equal(nextDue("Monthly", { monthDay: 2, hour: 9 }, at("2026-12-20T09:00:00")), 1798876800); // rolls the year
// Late evening in New York/Tokyo is a different calendar day there; WAT decides.
assert.equal(nextDue("Weekly", { weekday: FRI, hour: 0 }, at("2026-10-02T23:30:00")), 1791500400);
assert.equal(nextDue("Demo", { hour: 18 }, new Date(0)), 0);
console.log("due ok", process.env.TZ ?? "");
