// Pure decision for the auto-pay cron: which opted-in members still owe this round. Simulation has the final say.
// SquadState on-chain: 2 Active. The round opens at roundDeadline - roundLength (earlier reverts RoundNotOpen).
export type AutopayView = {
  state: number;
  roundDeadline: bigint;
  roundLength: number;
  members: readonly string[];
  paidThisRound: readonly boolean[];
};

export function dueMembers(v: AutopayView, enabled: readonly string[], nowSec: bigint): string[] {
  if (v.state !== 2 || nowSec < v.roundDeadline - BigInt(v.roundLength)) return [];
  const want = new Set(enabled.map((m) => m.toLowerCase()));
  return v.members.filter((m, i) => want.has(m.toLowerCase()) && !v.paidThisRound[i]);
}
