import { hasSeat, needsNextSquad, planJudgeStep, type JudgeView } from "./judge-plan.ts";
import assert from "node:assert";

const ADA = "0xAda0000000000000000000000000000000000001";
const TUNDE = "0x7de0000000000000000000000000000000000002";
const JUDGE = "0x1d90000000000000000000000000000000000003";
const bots = [ADA, TUNDE] as const;
const c = 2000n;
const open: JudgeView = {
  state: 0, contribution: c, maxMembers: 3, roundLength: 300, grace: 60, roundDeadline: 0n,
  organizer: ADA.toLowerCase(), members: [ADA], paidThisRound: [false], owed: [0n],
};
const call = (bot: 0 | 1, fn: string, approve = 0n) => ({ kind: "call", bot, fn, approve });

// Open: Tunde joins, then waits for a judge, then Ada starts (straight to Active, no deposit).
assert.deepEqual(planJudgeStep(open, bots, 1n), call(1, "join"));
assert.equal(planJudgeStep({ ...open, members: [ADA, TUNDE.toLowerCase()] }, bots, 1n), null);
assert.deepEqual(planJudgeStep({ ...open, members: [ADA, TUNDE, JUDGE] }, bots, 1n), call(0, "start"));
assert.deepEqual(planJudgeStep({ ...open, members: [ADA, JUDGE] }, bots, 1n), call(1, "join")); // judge beat Tunde in
assert.equal(planJudgeStep({ ...open, organizer: JUDGE }, bots, 1n), null); // not ours

// Active: pay once the round opens (deadline - length) until the grace ends; skip paid.
const act: JudgeView = { ...open, state: 2, roundDeadline: 1000n, members: [JUDGE, ADA, TUNDE], paidThisRound: [false, false, false], owed: [0n, 0n, 0n] };
assert.equal(planJudgeStep(act, bots, 699n), null);
assert.deepEqual(planJudgeStep(act, bots, 700n), call(0, "contribute", c));
assert.deepEqual(planJudgeStep({ ...act, paidThisRound: [false, true, false] }, bots, 900n), call(1, "contribute", c));
assert.equal(planJudgeStep(act, bots, 1061n), null); // past grace
assert.equal(planJudgeStep({ ...act, paidThisRound: [false, true, true] }, bots, 900n), null);

// A bot with debt pays it back first, while Active or after Completed; the judge's debt is not ours.
assert.deepEqual(planJudgeStep({ ...act, owed: [0n, 0n, 1500n] }, bots, 900n), call(1, "payBack", 1500n));
assert.deepEqual(planJudgeStep({ ...act, state: 3, owed: [0n, 2000n, 0n] }, bots, 0n), call(0, "payBack", 2000n));
assert.deepEqual(planJudgeStep({ ...act, owed: [2000n, 0n, 0n] }, bots, 700n), call(0, "contribute", c));

// Finished squads are marked done.
assert.deepEqual(planJudgeStep({ ...act, state: 3 }, bots, 0n), { kind: "finished" });
assert.deepEqual(planJudgeStep({ ...act, state: 4 }, bots, 0n), { kind: "finished" });

// Rotation: a fresh squad is needed once no Open squad has a free seat.
assert.equal(needsNextSquad([]), true);
assert.equal(needsNextSquad([open]), false);
assert.equal(hasSeat({ ...open, members: [ADA, TUNDE, JUDGE] }), false);
assert.equal(needsNextSquad([act, { ...open, members: [ADA, TUNDE, JUDGE] }]), true);
console.log("judge-plan ok");
