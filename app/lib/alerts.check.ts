import assert from "node:assert";
import { alertsFor } from "./alerts.ts";

const SQ = "0xsq";
const [A, B, C, D] = ["0xa", "0xb", "0xc", "0xd"];
const owedTable: Record<string, [bigint, bigint]> = { [C]: [0n, 2000n], [D]: [1000n, 1000n] };
const owed = (_s: string, m: string, when: "before" | "after") => owedTable[m]?.[when === "before" ? 0 : 1] ?? 0n;

// Round 2, B collects; C's miss became debt (2,000), D's was covered by held money, B (the collector) missing is skipped.
assert.deepStrictEqual(alertsFor("0xt", [{ squad: SQ, round: 2, collector: B, missed: [C, D, B] }], [], owed), [
  { member: C, squad: SQ, round: 2, stage: "debt", ref: "", amount: 2000n },
  { member: D, squad: SQ, round: 2, stage: "covered", ref: "", amount: 0n },
  { member: B, squad: SQ, round: 2, stage: "short", ref: "", amount: 2000n },
]);
// Nobody missed: nothing.
assert.deepStrictEqual(alertsFor("0xt", [{ squad: SQ, round: 1, collector: A, missed: [] }], [], owed), []);
// Only the collector missed: no debt, no alert.
assert.deepStrictEqual(alertsFor("0xt", [{ squad: SQ, round: 1, collector: A, missed: [A] }], [], owed), []);
// Pay back: one credit alert per CreditPaid, told apart by tx:logIndex; round from a settle in the same tx, else 0.
assert.deepStrictEqual(alertsFor("0xt", [], [{ squad: SQ, member: A, amount: 500n, logIndex: 7 }], owed), [
  { member: A, squad: SQ, round: 0, stage: "credit", ref: "0xt:7", amount: 500n },
]);
assert.equal(alertsFor("0xt", [{ squad: SQ, round: 3, collector: C, missed: [] }], [{ squad: SQ, member: A, amount: 1n, logIndex: 2 }], owed)[0].round, 3);
console.log("alerts ok");
