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
const ctx = { token: TOKEN, isSquad: (a: string) => a.toLowerCase() === SQ };
const run = (logs: ReturnType<typeof log>[]) => classify(logs, ctx).map(({ logIndex, ...r }: Row) => (void logIndex, r));

// topup
assert.deepStrictEqual(run([transfer(ZERO, A, 10000)]), [{ member: A, kind: "topup", amount: n(10000), squad: null, round: null }]);
// contribution that auto-settles: B collects round 2 (4,000 held), C missed
assert.deepStrictEqual(
  run([
    transfer(A, SQ, 5000),
    log(SQ, "Contributed", { member: A, round: 2, late: false }),
    log(SQ, "PayoutHeld", { member: B, round: 2, amount: n(4000) }),
    transfer(SQ, B, 6000),
    log(SQ, "RoundSettled", { round: 2, collector: B, amount: n(6000), missed: [C] }),
  ]),
  [
    { member: A, kind: "contribution", amount: n(5000), squad: SQ, round: 2 },
    { member: B, kind: "payout", amount: n(6000), squad: SQ, round: 2 },
    { member: B, kind: "held", amount: n(4000), squad: SQ, round: 2 },
  ],
);
// last round: payout to the collector, then _finish returns held money
assert.deepStrictEqual(
  run([
    transfer(SQ, B, 15000),
    log(SQ, "RoundSettled", { round: 3, collector: B, amount: n(15000), missed: [] }),
    transfer(SQ, A, 7500),
    transfer(SQ, B, 7500),
  ]).map((r) => r.kind),
  ["payout", "refund", "refund"],
);
// payBack: C pays 5,000 in, it goes straight to A (credit), then PaidBack
assert.deepStrictEqual(
  run([transfer(C, SQ, 5000), transfer(SQ, A, 5000), log(SQ, "CreditPaid", { member: A, amount: n(5000) }), log(SQ, "PaidBack", { member: C, amount: n(5000) })]),
  [
    { member: C, kind: "payback", amount: n(5000), squad: SQ, round: null },
    { member: A, kind: "credit", amount: n(5000), squad: SQ, round: null },
  ],
);
// a collector with debt: it comes out of their payout and reaches A as credit before the payout transfer
assert.deepStrictEqual(
  run([transfer(SQ, A, 2000), log(SQ, "CreditPaid", { member: A, amount: n(2000) }), transfer(SQ, C, 4000), log(SQ, "RoundSettled", { round: 3, collector: C, amount: n(4000), missed: [] })]).map((r) => [r.member, r.kind]),
  [[A, "credit"], [C, "payout"]],
);
// a CreditPaid to the collector is never mistaken for their payout (payout 0: everything held or repaid)
assert.deepStrictEqual(
  run([transfer(SQ, B, 1000), log(SQ, "CreditPaid", { member: B, amount: n(1000) }), log(SQ, "RoundSettled", { round: 2, collector: B, amount: 0n, missed: [] })]).map((r) => r.kind),
  ["credit"],
);
// a squad event from a non-squad contract does not turn a refund into a payout, and PayoutHeld from it is ignored
assert.deepStrictEqual(run([transfer(SQ, B, 1), log(C, "RoundSettled", { round: 1, collector: B, amount: n(1), missed: [A] })]).map((r) => r.kind), ["refund"]);
assert.deepStrictEqual(run([log(C, "PayoutHeld", { member: A, round: 1, amount: n(1) })]), []);
// member to member, withdraw, and other tokens ignored
assert.deepStrictEqual(run([transfer(A, B, 300)]).map((r) => [r.member, r.kind, r.counterparty]), [[A, "sent", B], [B, "received", A]]);
assert.deepStrictEqual(run([transfer(A, DEAD, 300)])[0].counterparty, undefined);
// a self-transfer moves nothing, and two rows would share one (tx, log_index, member) key
assert.deepStrictEqual(run([transfer(A, A, 300)]), []);
assert.deepStrictEqual(run([transfer(A, DEAD, 300)]).map((r) => r.kind), ["withdraw"]);
assert.deepStrictEqual(run([log(C, "Transfer", { from: ZERO, to: A, value: n(1) })]), []);
console.log("activity-classify ok");
