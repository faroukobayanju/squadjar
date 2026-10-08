// Pure: which in-app alerts one transaction's squad events call for. No runtime imports, so `node lib/alerts.check.ts` runs it.
// A settle with missed[] alerts each misser (debt to pay back, or held money covered it) and the short-paid collector;
// every CreditPaid alerts the member who got money back.
export type Stage = "debt" | "covered" | "short" | "credit";
export type Alert = { member: string; squad: string; round: number; stage: Stage; ref: string; amount: bigint };
export type Settle = { squad: string; round: number; collector: string; missed: readonly string[] };
export type Credit = { squad: string; member: string; amount: bigint; logIndex: number };

/** `owed(squad, member, when)`: the member's debt just before (`"before"`) and after (`"after"`) this transaction. */
export function alertsFor(tx: string, settles: readonly Settle[], credits: readonly Credit[], owed: (squad: string, member: string, when: "before" | "after") => bigint): Alert[] {
  const out: Alert[] = [];
  for (const s of settles) {
    const collector = s.collector.toLowerCase();
    let short = BigInt(0);
    for (const raw of s.missed) {
      const m = raw.toLowerCase();
      if (m === collector) continue; // missing their own round just makes their payout smaller; no debt
      const after = owed(s.squad, m, "after");
      const added = after - owed(s.squad, m, "before");
      short += added;
      out.push(added > BigInt(0) ? { member: m, squad: s.squad, round: s.round, stage: "debt", ref: "", amount: after } : { member: m, squad: s.squad, round: s.round, stage: "covered", ref: "", amount: BigInt(0) });
    }
    if (short > BigInt(0)) out.push({ member: collector, squad: s.squad, round: s.round, stage: "short", ref: "", amount: short });
  }
  for (const c of credits) {
    const round = settles.find((s) => s.squad === c.squad)?.round ?? 0; // a pay back has no round of its own
    out.push({ member: c.member.toLowerCase(), squad: c.squad, round, stage: "credit", ref: `${tx}:${c.logIndex}`, amount: c.amount });
  }
  return out;
}
