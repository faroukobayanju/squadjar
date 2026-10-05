import assert from "node:assert";
import { encodeAbiParameters, encodeEventTopics, parseUnits, type Hex } from "viem";
import { EVENTS, classify, type Row } from "./activity-classify.ts";

const TOKEN = "0x00000000000000000000000000000000000000aa";
const SQ = "0x00000000000000000000000000000000000000bb";
const A = "0x0000000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";
const C = "0x0000000000000000000000000000000000000003";
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const n = (x: number) => parseUnits(String(x), 18);

let i = 0;
function log(address: string, name: (typeof EVENTS)[number]["name"], args: Record<string, unknown>) {
  const ev = EVENTS.find((e) => e.name === name)!;
  const topics = encodeEventTopics({ abi: [ev], eventName: name, args } as never) as Hex[];
  const data = encodeAbiParameters(ev.inputs.filter((p) => !p.indexed), ev.inputs.filter((p) => !p.indexed).map((p) => args[p.name]) as never);
  return { address, topics, data, logIndex: i++ };
}
const transfer = (from: string, to: string, v: number) => log(TOKEN, "Transfer", { from, to, value: n(v) });
const ctx = { token: TOKEN, isSquad: (a: string) => a.toLowerCase() === SQ, contribution: () => n(5000) };
const run = (logs: ReturnType<typeof log>[]) => classify(logs, ctx).map(({ logIndex, ...r }: Row) => (void logIndex, r));

// topup
assert.deepStrictEqual(run([transfer(ZERO, A, 10000)]), [{ member: A, kind: "topup", amount: n(10000), squad: null, round: null }]);
// deposit (lockDeposit / refillDeposit)
assert.deepStrictEqual(run([transfer(A, SQ, 7500), log(SQ, "DepositLocked", { member: A, amount: n(7500) })]), [
  { member: A, kind: "deposit", amount: n(7500), squad: SQ, round: null },
]);
// contribution that auto-settles: B collects round 2, C missed (covered from deposit)
assert.deepStrictEqual(
  run([
    transfer(A, SQ, 5000),
    log(SQ, "Contributed", { member: A, round: 2, late: false }),
    transfer(SQ, B, 15000),
    log(SQ, "RoundSettled", { round: 2, collector: B, amount: n(15000), missed: [C] }),
  ]),
  [
    { member: A, kind: "contribution", amount: n(5000), squad: SQ, round: 2 },
    { member: B, kind: "payout", amount: n(15000), squad: SQ, round: 2 },
    { member: C, kind: "covered", amount: n(5000), squad: SQ, round: 2 },
  ],
);
// last round: payout to the collector, then _finish refunds (including the collector's own deposit)
assert.deepStrictEqual(
  run([
    transfer(SQ, B, 15000),
    log(SQ, "RoundSettled", { round: 3, collector: B, amount: n(15000), missed: [] }),
    transfer(SQ, A, 7500),
    transfer(SQ, B, 7500),
  ]).map((r) => r.kind),
  ["payout", "refund", "refund"],
);
// a squad event from a non-squad contract does not turn a refund into a payout
assert.deepStrictEqual(run([transfer(SQ, B, 1), log(C, "RoundSettled", { round: 1, collector: B, amount: n(1), missed: [A] })]).map((r) => r.kind), ["refund"]);
// member to member, withdraw, and other tokens ignored
assert.deepStrictEqual(run([transfer(A, B, 300)]).map((r) => [r.member, r.kind]), [[A, "sent"], [B, "received"]]);
assert.deepStrictEqual(run([transfer(A, DEAD, 300)]).map((r) => r.kind), ["withdraw"]);
assert.deepStrictEqual(run([log(C, "Transfer", { from: ZERO, to: A, value: n(1) })]), []);
console.log("activity-classify ok");
