import { hasSeat, needsNextSquad, planJudgeStep, type JudgeView } from "./judge-plan.ts";
import assert from "node:assert";

const ADA = "0xAda0000000000000000000000000000000000001";
const TUNDE = "0x7de0000000000000000000000000000000000002";
const JUDGE = "0x1d90000000000000000000000000000000000003";
const bots = [ADA, TUNDE] as const;
const c = 2000n;
const open: JudgeView = {
  state: 0, contribution: c, maxMembers: 3, roundLength: 300, grace: 60, depositDeadline: 0n, roundDeadline: 0n,
  organizer: ADA.toLowerCase(), members: [ADA], locked: [0n], required: [0n], paidThisRound: [false], stopped: [false],
};
const call = (bot: 0 | 1, fn: string, approve = 0n) => ({ kind: "call", bot, fn, approve });

// Open: Tunde joins, then waits for a judge, then Ada starts.
assert.deepEqual(planJudgeStep(open, bots, 1n), call(1, "join"));
assert.equal(planJudgeStep({ ...open, members: [ADA, TUNDE.toLowerCase()] }, bots, 1n), null);
assert.deepEqual(planJudgeStep({ ...open, members: [ADA, TUNDE, JUDGE] }, bots, 1n), call(0, "start"));
assert.deepEqual(planJudgeStep({ ...open, members: [ADA, JUDGE] }, bots, 1n), call(1, "join")); // judge beat Tunde in
assert.equal(planJudgeStep({ ...open, organizer: JUDGE }, bots, 1n), null); // not ours

// Depositing: each bot locks what it still owes; nothing after the window (settle cron finalizes).
const dep: JudgeView = { ...open, state: 1, depositDeadline: 100n, members: [JUDGE, ADA, TUNDE], locked: [0n, 0n, 0n], required: [4000n, 2000n, 2000n], paidThisRound: [false, false, false], stopped: [false, false, false] };
assert.deepEqual(planJudgeStep(dep, bots, 50n), call(0, "lockDeposit", 2000n));
assert.deepEqual(planJudgeStep({ ...dep, locked: [0n, 2000n, 500n] }, bots, 50n), call(1, "lockDeposit", 1500n));
assert.equal(planJudgeStep({ ...dep, locked: [0n, 2000n, 2000n] }, bots, 50n), null); // waiting for the judge
assert.equal(planJudgeStep(dep, bots, 101n), null);

// Active: pay once the round opens (deadline - length) until the grace ends; skip paid and stopped.
const act: JudgeView = { ...dep, state: 2, roundDeadline: 1000n, locked: [4000n, 2000n, 2000n] };
assert.equal(planJudgeStep(act, bots, 699n), null);
assert.deepEqual(planJudgeStep(act, bots, 700n), call(0, "contribute", c));
assert.deepEqual(planJudgeStep({ ...act, paidThisRound: [false, true, false] }, bots, 900n), call(1, "contribute", c));
assert.deepEqual(planJudgeStep({ ...act, paidThisRound: [false, false, false], stopped: [false, true, false] }, bots, 1060n), call(1, "contribute", c));
assert.equal(planJudgeStep(act, bots, 1061n), null); // past grace
assert.equal(planJudgeStep({ ...act, paidThisRound: [false, true, true] }, bots, 900n), null);

// Finished squads are marked done.
assert.deepEqual(planJudgeStep({ ...act, state: 3 }, bots, 0n), { kind: "finished" });
assert.deepEqual(planJudgeStep({ ...act, state: 4 }, bots, 0n), { kind: "finished" });

// Rotation: a fresh squad is needed once no Open squad has a free seat.
assert.equal(needsNextSquad([]), true);
assert.equal(needsNextSquad([open]), false);
assert.equal(hasSeat({ ...open, members: [ADA, TUNDE, JUDGE] }), false);
assert.equal(needsNextSquad([act, { ...open, members: [ADA, TUNDE, JUDGE] }]), true);
console.log("judge-plan ok");
