"use client";

import { LockSimple } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { Countdown } from "@/components/countdown";
import { naira } from "@/lib/format";
import { ME, myTurn, useActions, type Squad } from "@/lib/data";
import { ConfirmButton, ErrorNote, GHOST_BTN, PAID_LABEL, PALM_BTN, SquadTitle, useRun } from "./ui";

/** Started: turns are fixed and everyone locks a deposit before round 1. Live only (the demo never enters this state). */
export function DepositingView({ squad }: { squad: Squad }) {
  const actions = useActions();
  const lock = useRun("payment");
  const cancel = useRun("other");
  const owe = Math.max(0, squad.myRequired - squad.myDeposit);
  const inCount = squad.members.filter((m) => squad.depositsIn.includes(m.id)).length;

  const action =
    owe > 0 ? (
      <button type="button" disabled={lock.busy} onClick={() => lock.run(() => actions.lockDeposit(squad.slug))} className={PALM_BTN}>
        {lock.busy ? "Locking…" : lock.error ? `Retry ${naira(owe)}` : `Lock ${naira(owe)} deposit`}
      </button>
    ) : (
      <p className={PAID_LABEL}>
        <span aria-hidden className="ink ink-2 -rotate-6 border-2 border-stamp px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-stamp">
          DEPOSIT IN
        </span>
        Waiting for the rest.
      </p>
    );

  return (
    <AppShell action={action}>
      <SquadTitle squad={squad} meta="Deposits" />

      <section aria-labelledby="deposits" className="mt-10">
        <h2 id="deposits" className="font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
          Deposits close in <Countdown to={squad.depositDeadline} />
        </h2>
        <p className="mt-2 max-w-[38ch] text-muted">
          {owe > 0
            ? `Your deposit is ${naira(squad.myRequired)}. It covers a missed contribution and comes back at the end. Turn ${myTurn(squad)}.`
            : `Your ${naira(squad.myDeposit)} deposit is locked and comes back at the end. Turn ${myTurn(squad)}.`}
        </p>
        <p className="mt-2 text-sm text-muted">Anyone who hasn&apos;t locked theirs when time runs out is dropped, with no penalty.</p>
      </section>

      <section aria-labelledby="turns" className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 id="turns" className="font-semibold">
            Turn order
          </h2>
          <p className="font-mono text-xs text-muted tnum">
            {inCount} of {squad.members.length} locked
          </p>
        </div>
        <ol className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper">
          {squad.members.map((m, i) => {
            const locked = squad.depositsIn.includes(m.id);
            return (
              <li key={m.id} className="flex min-h-12 items-center gap-3 px-4">
                <span className="w-6 font-mono text-xs text-muted tnum">{i + 1}</span>
                <span className={`flex-1 truncate ${m.id === ME ? "font-bold" : "font-semibold"}`}>{m.id === ME ? "You" : m.name}</span>
                {locked ? (
                  <span className="flex items-center gap-1 font-mono text-xs text-stamp">
                    <LockSimple size={14} weight="bold" aria-hidden />
                    locked
                  </span>
                ) : (
                  <span className="font-mono text-xs text-muted">waiting</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-10">
        <ErrorNote error={lock.error ?? cancel.error} />
        {squad.organizerId === ME && (
          <ConfirmButton
            label="Cancel squad"
            busyLabel="Cancelling…"
            body="The squad closes for everyone, and every locked deposit goes straight back."
            busy={cancel.busy}
            className={GHOST_BTN}
            onConfirm={() => cancel.run(() => actions.cancel(squad.slug))}
          />
        )}
      </div>
    </AppShell>
  );
}
