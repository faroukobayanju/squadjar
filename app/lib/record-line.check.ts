import assert from "node:assert";
import { ZERO_RECORD, recordLine, stoppedLine } from "./record-line.ts";
import { en } from "./i18n/en.ts";
import { fmt } from "./i18n/core.ts";

const t = (k: keyof typeof en, v?: Record<string, string | number>) => fmt(en[k], v);
assert.strictEqual(recordLine(ZERO_RECORD, t), "0 on time");
assert.strictEqual(recordLine({ ...ZERO_RECORD, onTime: 12, missed: 1 }, t), "12 on time · 1 missed");
assert.strictEqual(recordLine({ ...ZERO_RECORD, onTime: 3, late: 2, missed: 1 }, t), "3 on time · 2 late · 1 missed");
assert.strictEqual(stoppedLine(ZERO_RECORD, t), null);
assert.strictEqual(stoppedLine(undefined, t), null);
assert.strictEqual(stoppedLine({ ...ZERO_RECORD, stoppedSquads: 1 }, t), "Stopped paying in 1 squad");
assert.strictEqual(stoppedLine({ ...ZERO_RECORD, stoppedSquads: 2 }, t), "Stopped paying in 2 squads");
console.log("record-line ok");
