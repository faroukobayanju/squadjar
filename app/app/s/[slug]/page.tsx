"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { WhatsappLogo, LockSimple } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { Countdown } from "@/components/countdown";
import { EmptyBox, Stamp } from "@/components/stamp";
import { StampCard } from "@/components/stamp-card";
import { naira } from "@/lib/format";
import { useOrigin } from "@/lib/origin";
import {
  ME,
  clearJustStamped,
  collectorOf,
  myTurn,
  payoutAmount,
  squadBySlug,
  useStore,
  type Squad,
} from "@/lib/store";

export default function SquadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const state = useStore((s) => s);
  const squad = squadBySlug(state, slug);
  const fresh = state.justStamped?.slug === slug ? state.justStamped : undefined;

  useEffect(() => {
    if (!fresh) return;
    navigator.vibrate?.(20);
    const t = setTimeout(clearJustStamped, 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  if (!squad) return <NotFound />;
  if (squad.state === "Open") return <OpenSquad squad={squad} />;

  const r = squad.currentRound;
  const paidIds = squad.paid[r] ?? [];
  const iPaid = paidIds.includes(ME);
  const collector = collectorOf(squad);
  const done = squad.state === "Completed";

  const action = done ? null : iPaid ? (
    <p className="flex min-h-14 items-center justify-center rounded-lg border border-rule font-semibold text-muted">
      Paid round {r}. Your stamp is on the card.
    </p>
  ) : (
    <Link
      href={`/s/${slug}/pay`}
      className="flex min-h-14 items-center justify-center rounded-lg bg-palm font-money text-[1.25rem] font-bold text-on-palm transition-transform duration-75 active:scale-[0.98] active:bg-palm-press"
    >
      Pay {naira(squad.contribution)}
    </Link>
  );

  return (
    <AppShell action={action}>
      <header>
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
        <p className="mt-2 font-mono text-xs text-muted">
          {done ? "Completed" : `Round ${r} of ${squad.members.length}`} · {naira(squad.contribution)} each · {squad.period}
        </p>
      </header>

      {done ? (
        <section className="mt-10">
          <p className="font-display text-3xl font-extrabold tracking-[-0.03em]">Everyone collected.</p>
          <p className="mt-2 max-w-[34ch] text-muted">
            Deposits went back to everyone who kept paying. Start the next squad when you&apos;re ready.
          </p>
        </section>
      ) : (
        <section aria-labelledby="next-payout" className="mt-8">
          <h2 id="next-payout" className="font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
            {collector.id === ME ? "You collect" : `${collector.name} collects`} in <Countdown to={squad.roundDeadline} />
          </h2>
          <p className="mt-1 font-money text-[clamp(3.4rem,17vw,4.6rem)] leading-[0.95] font-bold tnum">
            {naira(payoutAmount(squad))}
          </p>
          <p className="mt-2 text-sm text-muted">
            The jar pays automatically when everyone has paid, or when the round closes.
          </p>
        </section>
      )}

      {!done && (
        <section aria-labelledby="this-round" className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 id="this-round" className="font-semibold">
              This round
            </h2>
            <p className="font-mono text-xs text-muted tnum">
              {paidIds.length} of {squad.members.length} paid
            </p>
          </div>
          <ul className="mt-3 grid grid-cols-4 gap-y-4">
            {squad.members.map((m) => {
              const paid = paidIds.includes(m.id);
              return (
                <li key={m.id} className="flex flex-col items-center gap-1.5">
                  {paid ? (
                    <Stamp memberId={m.id} name={m.name} round={r} size="md" fresh={fresh?.round === r && m.id === ME} />
                  ) : (
                    <EmptyBox size="md" label={`${m.name} hasn't paid yet`} />
                  )}
                  <span className={`max-w-full truncate text-xs ${m.id === ME ? "font-semibold text-palm" : "text-ink"}`}>
                    {m.id === ME ? "You" : m.name}
                  </span>
                </li>
              );
            })}
          </ul>
          {paidIds.length < squad.members.length && <RemindSquad squad={squad} />}
        </section>
      )}

      <section aria-labelledby="card" className="mt-10">
        <h2 id="card" className="mb-3 font-semibold">
          The card
        </h2>
        <StampCard squad={squad} fresh={fresh} />
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <LockSimple size={16} aria-hidden />
          {squad.myDeposit > 0
            ? `Your deposit ${naira(squad.myDeposit)} is locked and comes back at the end. Turn ${myTurn(squad)}.`
            : "Your deposit has been returned."}
        </p>
      </section>
    </AppShell>
  );
}

function RemindSquad({ squad }: { squad: Squad }) {
  const origin = useOrigin();
  const r = squad.currentRound;
  const waiting = squad.members.filter((m) => !(squad.paid[r] ?? []).includes(m.id) && m.id !== ME);
  if (!waiting.length) return null;
  const text = `${waiting.map((m) => m.name).join(", ")}: ${naira(squad.contribution)} for ${squad.name} is due. ${collectorOf(squad).name} collects this round. Pay here: ${origin}/s/${squad.slug}/pay`;
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="mt-5 inline-flex min-h-12 items-center gap-2 font-semibold text-ink underline decoration-rule decoration-2 hover:decoration-ink"
    >
      <WhatsappLogo size={20} aria-hidden />
      Remind {waiting.length === 1 ? waiting[0].name : `the ${waiting.length} who haven't paid`}
    </a>
  );
}

function OpenSquad({ squad }: { squad: Squad }) {
  const link = `${useOrigin()}/s/${squad.slug}`;
  const text = `Join "${squad.name}" on Squadjar: ${naira(squad.contribution)} each ${squad.period.toLowerCase()}, ${squad.maxMembers} of us. Nobody holds the jar. ${link}`;
  const short = Math.max(0, 3 - squad.members.length);
  return (
    <AppShell
      action={
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]"
        >
          <WhatsappLogo size={22} weight="fill" aria-hidden />
          Invite on WhatsApp
        </a>
      }
    >
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        Open · {naira(squad.contribution)} each · {squad.period} · {squad.members.length} of {squad.maxMembers} joined
      </p>
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {short > 0 ? `Invite ${short} more to start.` : "Ready when you are."}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        Turns are set when you start: people with the best payment record go first. Everyone then locks a refundable deposit.
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {squad.members.map((m) => (
          <li key={m.id} className="flex min-h-12 items-center justify-between px-4">
            <span className="font-semibold">{m.id === ME ? "You (organizer)" : m.name}</span>
            <span className="font-mono text-xs text-stamp">{m.tier}</span>
          </li>
        ))}
        {Array.from({ length: squad.maxMembers - squad.members.length }, (_, i) => (
          <li key={`empty-${i}`} className="flex min-h-12 items-center px-4 text-muted">
            Open seat
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

function NotFound() {
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">We can&apos;t find that squad.</h1>
      <p className="mt-2 text-muted">The link may be old. Ask whoever invited you for a fresh one.</p>
      <Link href="/home" className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
        Go to your squads
      </Link>
    </AppShell>
  );
}
