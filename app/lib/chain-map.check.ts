import { toSquad } from "./chain-map.ts";
import assert from "node:assert";

const A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as const;
const ME_ADDR = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb" as const;
const C = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc" as const;
const e18 = 10n ** 18n;

// 3-member Active squad in round 2; me second in turn order; member 3 missed round 1, so A (round 1's collector) has credit.
const view = {
  state: 2, contribution: 5000n * e18, maxMembers: 3, roundLength: 300, grace: 60,
  roundDeadline: 1_000_000n, currentRound: 2, organizer: A,
  members: [A, ME_ADDR, C], locked: [10000n * e18, 0n, 0n], allowance: [0, 25, 0],
  paidThisRound: [true, false, false], misses: [0, 0, 1],
  owed: [0n, 0n, 5000n * e18], credit: [5000n * e18, 0n, 0n], countsForTrust: false, totalLocked: 10000n * e18, settleableAfter: 1_000_060n,
};

const q = toSquad({
  address: "0x1111111111111111111111111111111111111111",
  slug: "csc", name: "CSC",
  view,
  history: { 1: [A, ME_ADDR] },
  names: { [A.toLowerCase()]: "Tolu" },
  tiers: { [A.toLowerCase()]: "Reliable" },
  me: ME_ADDR,
});

assert.equal(q.members[1].id, "me");
assert.equal(q.members[0].id, A.toLowerCase());
assert.equal(q.members[0].name, "Tolu");
assert.equal(q.members[2].name, "Member 3");
assert.equal(q.organizerId, A.toLowerCase());
assert.equal(q.amMember, true);
assert.equal(q.period, "Demo");
assert.equal(q.state, "Active");
assert.deepStrictEqual(q.missed[1], [C.toLowerCase()]);
assert.deepStrictEqual(q.paid[1], [A.toLowerCase(), "me"]);
assert.deepStrictEqual(q.paid[2], [A.toLowerCase()]);
assert.equal(q.roundDeadline, 1_000_000 * 1000);
assert.equal(q.roundOpensAt, (1_000_000 - 300) * 1000);
assert.equal(q.settleableAfter, 1_000_060 * 1000);
assert.equal(q.contribution, 5000);
assert.equal(q.myHeld, 0);
assert.equal(q.myAllowance, 25);
assert.equal(q.myOwed, 0);
assert.equal(q.myCredit, 0);
assert.deepStrictEqual(q.creditors, [A.toLowerCase()]);
const c = toSquad({ address: A, slug: "x", name: "x", history: {}, names: {}, tiers: {}, me: C, view });
assert.equal(c.myOwed, 5000); // C's debt
assert.equal(toSquad({ address: A, slug: "x", name: "x", history: {}, names: {}, tiers: {}, me: A, view }).myHeld, 10000);
assert.equal(toSquad({ ...{ address: A, slug: "x", name: "x", history: {}, names: {}, tiers: {}, me: ME_ADDR }, view: { ...view, roundLength: 604800 } }).period, "Weekly");
console.log("chain-map ok");
