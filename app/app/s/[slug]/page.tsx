"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { WhatsappLogo, LockSimple } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { AutopayToggle } from "@/components/autopay-toggle";
import { Countdown, useNow } from "@/components/countdown";
import { EmptyBox, Stamp } from "@/components/stamp";
import { StampCard } from "@/components/stamp-card";
import { Bar } from "@/components/skeleton";
import { DepositingView } from "@/components/squad/depositing";
import { JoinView, OpenView } from "@/components/squad/open";
import { AddMoneyNote, ErrorNote, Notice, PAID_LABEL, PALM_BTN, useRun } from "@/components/squad/ui";
import { KNOWN } from "@/lib/errors";
import { dueLabel, naira } from "@/lib/format";
import { useOrigin } from "@/lib/origin";
import { refreshAll } from "@/lib/live/squads";
import { ME, clearJustStamped, collectorOf, myTurn, payoutAmount, useActions, useJustStamped, useMe, useSquad, type Squad } from "@/lib/data";

export default function SquadPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> }) {
  const { slug } = use(params);
  const { code } = use(searchParams);
  const squad = useSquad(slug);
  const me = useMe();
  const fresh = useJustStamped(slug);
  const now = useNow();
  const { refill } = useActions();
  const topUp = useRun("payment");

  useEffect(() => {
    if (!fresh) return;
    navigator.vibrate?.(20);
    const t = setTimeout(clearJustStamped, 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  // Overdue: ask the relayer once per deadline per page view, then refresh. Demo squads have no address.
  const overdue =
    squad && squad.address && now !== null
      ? squad.state === "Active" && now > squad.settleableAfter
        ? `a${squad.currentRound}`
        : squad.state === "Depositing" && now > squad.depositDeadline
          ? "d"
          : null
      : null;
  const poked = useRef<string | null>(null);
  const addr = squad?.address;
  useEffect(() => {
    if (!overdue || !addr || poked.current === `${addr}${overdue}`) return;
    poked.current = `${addr}${overdue}`;
    fetch("/api/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ squad: addr }) })
      .then(() => refreshAll())
      .catch(() => {});
  }, [overdue, addr]);

  if (squad === undefined) return <SquadSkeleton />;
  if (!squad) return <Notice title="We can't find that squad." body="The link may be old. Ask whoever invited you for a fresh one." />;
  if (squad.state === "Cancelled") return <Notice title="This squad was cancelled." body="Deposits were returned." />;
  if (!squad.amMember) {
    return squad.state === "Open" ? (
      <JoinView squad={squad} code={code} />
    ) : (
      <Notice title="This squad has already started." body="Ask the organizer about the next one, or start your own." />
    );
  }
  if (squad.state === "Open") return <OpenView squad={squad} />;
  if (squad.state === "Depositing") return <DepositingView squad={squad} />;

  const r = squad.currentRound;
  const paidIds = squad.paid[r] ?? [];
  const iPaid = paidIds.includes(ME);
  const collector = collectorOf(squad);
  const done = squad.state === "Completed";
  const notOpenYet = now !== null && now < squad.roundOpensAt;
  const iStopped = squad.stopped.includes(ME);
  const refillOwed = Math.max(0, squad.myRequired - squad.myDeposit);

  const action = done ? null : iStopped ? (
    <p className={PAID_LABEL}>{KNOWN.MemberStoppedPaying}</p>
  ) : iPaid ? (
    <p className={PAID_LABEL}>Paid round {r}. Your stamp is on the card.</p>
  ) : notOpenYet ? (
    <p className={PAID_LABEL}>
      <span>
        Round {r} opens in <Countdown to={squad.roundOpensAt} />
      </span>
    </p>
  ) : (
    <Link href={`/s/${slug}/pay`} className={PALM_BTN}>
      Pay {naira(squad.contribution)}
    </Link>
  );

  return (
    <AppShell action={action}>
      <header>
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
        <p className="mt-2 font-mono text-xs text-muted">
          {done ? "Completed" : `Round ${r} of ${squad.members.length}`} ·{" "}
          <span className="font-money text-[13px] font-bold text-ink">{naira(squad.contribution)}</span> each · {squad.period}
        </p>
      </header>

      {!done && !iStopped && refillOwed > 0 && (
        <section aria-label="Top up your deposit" className="mt-8 rounded-md border border-warn/40 bg-warn/8 p-4">
          <p className="text-sm">
            Top up your deposit by <span className="font-money font-bold">{naira(refillOwed)}</span> before {dueLabel(squad.settleableAfter)} to stay in good
            standing.
          </p>
          <div className="mt-3">
            <ErrorNote error={topUp.error} />
            {me && me.balance < refillOwed ? (
              <AddMoneyNote short={refillOwed - me.balance} balance={me.balance} next={`/s/${slug}`} />
            ) : (
              <button type="button" disabled={topUp.busy} onClick={() => topUp.run(() => refill(slug))} className={PALM_BTN}>
                {topUp.busy ? "Topping up…" : topUp.error ? `Retry ${naira(refillOwed)}` : `Top up ${naira(refillOwed)}`}
              </button>
            )}
          </div>
        </section>
      )}

      {done ? (
        <section className="mt-10">
          <p className="font-display text-3xl font-extrabold tracking-[-0.03em]">Everyone collected.</p>
          <p className="mt-2 max-w-[34ch] text-muted">
            Deposits went back to everyone who kept paying. Start the next squad when you&apos;re ready.
          </p>
        </section>
      ) : (
        <section aria-labelledby="next-payout" className="mt-10">
          <h2 id="next-payout" className="font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
            {collector.id === ME ? "You collect" : `${collector.name} collects`} in <Countdown to={squad.roundDeadline} />
          </h2>
          <p className="mt-2 font-money text-[clamp(4rem,23vw,7rem)] leading-[0.9] font-bold tracking-[-0.02em] tnum">
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
          <ul className="mt-4 grid grid-cols-4 gap-y-5">
            {squad.members.map((m) => {
              const paid = paidIds.includes(m.id);
              return (
                <li key={m.id} className="flex flex-col items-center gap-1.5">
                  {paid ? (
                    <Stamp memberId={m.id} name={m.name} round={r} size="lg" fresh={fresh?.round === r && m.id === ME} />
                  ) : (
                    <EmptyBox size="lg" label={`${m.name} hasn't paid yet`} />
                  )}
                  <span className={`max-w-full truncate text-xs ${m.id === ME ? "font-bold" : ""}`}>
                    {m.id === ME ? "You" : m.name}
                  </span>
                  {squad.stopped.includes(m.id) && <span className="font-mono text-[10px] text-bad">Stopped paying</span>}
                </li>
              );
            })}
          </ul>
          {paidIds.length < squad.members.length && <RemindSquad squad={squad} />}
        </section>
      )}

      {!done && !iStopped && <AutopayToggle squad={squad} />}

      <section aria-labelledby="card" className="mt-12">
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

function SquadSkeleton() {
  return (
    <AppShell action={<Bar className="h-14 w-full rounded-lg" />}>
      <div aria-busy="true" aria-label="Loading squad">
        <Bar className="h-[2.1rem] w-56" />
        <Bar className="mt-2 h-4 w-48" />
        <Bar className="mt-10 h-8 w-64" />
        <Bar className="mt-2 h-[clamp(4rem,23vw,7rem)] w-full max-w-72" />
        <Bar className="mt-2 h-4 w-60" />
        <div className="mt-8 flex items-baseline justify-between">
          <h2 className="font-semibold">This round</h2>
          <Bar className="h-4 w-16" />
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-y-5">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex flex-col items-center gap-1.5">
              <Bar className="size-16 rounded-full" />
              <Bar className="h-3 w-10" />
            </li>
          ))}
        </ul>
        <h2 className="mt-12 mb-3 font-semibold">The card</h2>
        <Bar className="h-40 w-full rounded-lg" />
      </div>
    </AppShell>
  );
}
