import { plan } from "./poke-plan.ts";
import assert from "node:assert";

const v = { state: 2, depositDeadline: 0n, settleableAfter: 100n, paidThisRound: [true, false], stopped: [false, false] };
assert.equal(plan(v, 100n), null); // not past yet
assert.equal(plan(v, 101n), "settle");
assert.equal(plan({ ...v, paidThisRound: [true, true] }, 1n), "settle"); // everyone paid
assert.equal(plan({ ...v, paidThisRound: [true, false], stopped: [false, true] }, 1n), "settle"); // stopped member ignored
assert.equal(plan({ ...v, state: 1, depositDeadline: 50n }, 50n), null);
assert.equal(plan({ ...v, state: 1, depositDeadline: 50n }, 51n), "finalize");
assert.equal(plan({ ...v, state: 3 }, 999n), null);
console.log("poke-plan ok");
