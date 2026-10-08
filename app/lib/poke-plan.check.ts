import { plan } from "./poke-plan.ts";
import assert from "node:assert";

const v = { state: 2, settleableAfter: 100n, paidThisRound: [true, false] };
assert.equal(plan(v, 100n), null); // not past yet
assert.equal(plan(v, 101n), "settle");
assert.equal(plan({ ...v, paidThisRound: [true, true] }, 1n), "settle"); // everyone paid
assert.equal(plan({ ...v, state: 0 }, 999n), null); // Open: nothing to settle
assert.equal(plan({ ...v, state: 3 }, 999n), null);
console.log("poke-plan ok");
