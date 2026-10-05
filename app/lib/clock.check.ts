import assert from "node:assert";
import { clockOffset } from "./clock.ts";
import { dayLabel, dueLabel, timeLabel } from "./format.ts";

// Phone 3 minutes fast: the chain is 180s behind it.
assert.equal(clockOffset(1_000_000n, 1_000_180_000), -180_000);
assert.equal(clockOffset(1_000_060, 1_000_000_000), 60_000); // phone slow
assert.equal(clockOffset(5, 5000), 0);

// 2026-10-09T17:00:00Z = Friday 6:00 pm WAT, in any device zone.
const fri6pm = Date.UTC(2026, 9, 9, 17);
assert.match(dueLabel(fri6pm), /^Fri/);
assert.match(dueLabel(fri6pm), /18:00|6:00\s?pm/i);
assert.match(timeLabel(Date.UTC(2026, 9, 9, 23, 30)), /^0?0:30|12:30\s?am/i); // next day in WAT
// Late evening UTC is already "tomorrow" in Lagos.
const now = Date.UTC(2026, 9, 9, 23, 30); // Sat 12:30 am WAT
assert.equal(dayLabel(now - 3_600_000, now), "Yesterday"); // 22:30Z is Fri 11:30 pm WAT
assert.equal(dayLabel(now - 1_800_000, now), "Today"); // 23:00Z is Sat 12:00 am WAT
