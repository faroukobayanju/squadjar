"use client";

import { EmptyBox, PaidOutMark, Stamp } from "@/components/stamp";
import { ME, type Squad } from "@/lib/store";

/**
 * The squad's contribution card: members down the side in turn order, rounds across.
 * Scrolls sideways past ~5 rounds with the name column pinned.
 */
export function StampCard({ squad, fresh }: { squad: Squad; fresh?: { round: number } }) {
  const rounds = Array.from({ length: squad.members.length }, (_, i) => i + 1);
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-paper">
      <div className="overflow-x-auto">
        <table className="ledger w-max min-w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Contribution card for {squad.name}: who paid each round
          </caption>
          <thead>
            <tr className="h-10">
              <th scope="col" className="sticky left-0 z-10 bg-paper pl-3 text-left font-mono text-[11px] font-normal text-muted">
                Turn
              </th>
              {rounds.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className={`w-12 font-mono text-[11px] font-normal ${r === squad.currentRound ? "bg-palm/10 text-ink" : "text-muted"}`}
                >
                  R{r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {squad.members.map((m, i) => {
              const mine = m.id === ME;
              return (
                <tr key={m.id} className="h-10">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 bg-paper pr-3 pl-3 text-left font-semibold whitespace-nowrap ${mine ? "text-palm" : ""}`}
                  >
                    <span className="mr-2 inline-block w-4 font-mono text-[11px] font-normal text-muted tnum">{i + 1}</span>
                    {mine ? "You" : m.name}
                  </th>
                  {rounds.map((r) => {
                    const paid = squad.paid[r]?.includes(m.id);
                    const missed = squad.missed[r]?.includes(m.id);
                    const collects = r === i + 1 && r < squad.currentRound;
                    const future = r > squad.currentRound || squad.state === "Open";
                    return (
                      <td key={r} className={`text-center ${r === squad.currentRound ? "bg-palm/10" : ""}`}>
                        {collects ? (
                          <PaidOutMark />
                        ) : missed ? (
                          <span className="font-mono text-[10px] text-bad" title="Missed. Covered by deposit.">
                            missed
                          </span>
                        ) : paid ? (
                          <Stamp
                            memberId={m.id}
                            name={m.name}
                            round={r}
                            fresh={fresh?.round === r && mine}
                          />
                        ) : (
                          <EmptyBox label={future ? `Round ${r}, not yet due` : `${m.name} hasn't paid round ${r}`} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
