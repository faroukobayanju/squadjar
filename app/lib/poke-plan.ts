// Pure decision for the relayer: what (if anything) is worth simulating for a squad right now.
// SquadState on-chain: 1 Depositing, 2 Active.
export type PokeView = { state: number; depositDeadline: bigint; settleableAfter: bigint; paidThisRound: readonly boolean[]; stopped: readonly boolean[] };

export function plan(v: PokeView, nowSec: bigint): "settle" | "finalize" | null {
  if (v.state === 2) {
    const active = v.paidThisRound.filter((_, i) => !v.stopped[i]);
    // All-paid auto-settles inside contribute(); kept as a safety net, simulation has the final say.
    if (nowSec > v.settleableAfter || (active.length > 0 && active.every(Boolean))) return "settle";
  }
  if (v.state === 1 && nowSec > v.depositDeadline) return "finalize";
  return null;
}
