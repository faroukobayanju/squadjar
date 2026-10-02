"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { Countdown } from "@/components/countdown";
import { naira } from "@/lib/format";
import { ME, collectorOf, type Squad } from "@/lib/store";

export function SquadList({ squads }: { squads: Squad[] }) {
  return (
    <ul className="grid gap-3">
      {squads.map((q) => (
        <li key={q.slug}>
          <SquadRow squad={q} />
        </li>
      ))}
      <li>
        <Link
          href="/squads/new"
          className="flex min-h-16 items-center gap-3 rounded-lg border-[1.5px] border-dashed border-rule px-4 font-semibold text-ink hover:border-ink"
        >
          <Plus size={20} aria-hidden />
          Start a squad
        </Link>
      </li>
    </ul>
  );
}

function SquadRow({ squad: q }: { squad: Squad }) {
  const r = q.currentRound;
  const paid = q.paid[r] ?? [];
  const iPaid = paid.includes(ME);
  const collector = q.state === "Active" ? collectorOf(q) : undefined;
  return (
    <Link
      href={`/s/${q.slug}`}
      className="block rounded-lg border border-rule bg-paper px-4 py-4 transition-colors hover:border-ink/40 active:scale-[0.99]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate font-display text-[1.25rem] font-extrabold tracking-[-0.02em]">{q.name}</h3>
        <span className="shrink-0 font-money text-lg font-bold tnum">{naira(q.contribution)}</span>
      </div>
      {q.state === "Active" && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${paid.length} of ${q.members.length} paid this round`}>
            {q.members.map((m) => (
              <span
                key={m.id}
                className={`size-4 rounded-full ${paid.includes(m.id) ? "border-2 border-stamp bg-stamp/15" : "border-[1.5px] border-dashed border-rule"}`}
              />
            ))}
          </div>
          <p className="mt-3 flex justify-between gap-3 font-mono text-xs">
            <span className="text-muted">
              R{r} of {q.members.length} · {collector?.id === ME ? "you collect" : `${collector?.name} collects`}
            </span>
            {iPaid ? (
              <span className="text-stamp">paid</span>
            ) : (
              <span className="font-medium text-ink">
                due in <Countdown to={q.roundDeadline} />
              </span>
            )}
          </p>
        </>
      )}
      {q.state === "Open" && (
        <p className="mt-2 font-mono text-xs text-muted">
          Inviting · {q.members.length} of {q.maxMembers} joined
        </p>
      )}
      {q.state === "Completed" && <p className="mt-2 font-mono text-xs text-muted">Completed · deposits returned</p>}
    </Link>
  );
}
