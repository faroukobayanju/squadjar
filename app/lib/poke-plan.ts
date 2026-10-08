// Pure decision for the relayer: is a settle worth simulating for this squad right now? SquadState on-chain: 2 Active.
export type PokeView = { state: number; settleableAfter: bigint; paidThisRound: readonly boolean[] };

export function plan(v: PokeView, nowSec: bigint): "settle" | null {
  // All-paid auto-settles inside contribute(); kept as a safety net, simulation has the final say.
  if (v.state === 2 && (nowSec > v.settleableAfter || (v.paidThisRound.length > 0 && v.paidThisRound.every(Boolean)))) return "settle";
  return null;
}
