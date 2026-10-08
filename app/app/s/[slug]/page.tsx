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
import { JoinView, OpenView } from "@/components/squad/open";
import { AddMoneyNote, ErrorNote, Notice, PAID_LABEL, PALM_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { useOrigin } from "@/lib/origin";
import { refreshAll } from "@/lib/live/squads";
import { rich, useT } from "@/lib/i18n";
import { ME, clearJustStamped, collectorOf, heldAtMyTurn, myTurn, payoutAmount, useActions, useJustStamped, useMe, useRemind, useSquad, type Squad, type Tier } from "@/lib/data";

export default function SquadPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> }) {
  const { slug } = use(params);
  const { code } = use(searchParams);
  const squad = useSquad(slug);
  const me = useMe();
  const fresh = useJustStamped(slug);
  const now = useNow();
  const { payBack, settle } = useActions();
  const back = useRun("payment");
  const t = useT();

  useEffect(() => {
    if (!fresh) return;
    navigator.vibrate?.(20);
    const t = setTimeout(clearJustStamped, 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  // Overdue: ask the relayer once per deadline per page view, then refresh. Demo squads have no address.
  const overdue = squad && squad.address && now !== null && squad.state === "Active" && now > squad.settleableAfter ? `a${squad.currentRound}` : null;
  const poked = useRef<string | null>(null);
  const addr = squad?.address;
  useEffect(() => {
    if (!overdue || !addr || poked.current === `${addr}${overdue}`) return;
    poked.current = `${addr}${overdue}`;
    fetch("/api/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ squad: addr }) })
      // No relayer (503) or it failed: settle from this member's account instead. 429 = someone just asked.
      .then((r) => (r.ok || r.status === 429 ? refreshAll() : settle(slug)))
      .catch(() => settle(slug))
      .catch((e) => console.error("[settle]", e));
  }, [overdue, addr, slug, settle]);

  if (squad === undefined) return <SquadSkeleton />;
  if (!squad) return <Notice title={t("notFoundTitle")} body={t("notFoundBody")} />;
  if (squad.state === "Cancelled") return <Notice title={t("cancelledTitle")} body={t("cancelledBody")} />;
  if (!squad.amMember) {
    return squad.state === "Open" ? (
      <JoinView squad={squad} code={code} />
    ) : (
      <Notice title={t("startedTitle")} body={t("startedBody")} />
    );
  }
  if (squad.state === "Open") return <OpenView squad={squad} />;

  const r = squad.currentRound;
  const paidIds = squad.paid[r] ?? [];
  const iPaid = paidIds.includes(ME);
  const collector = collectorOf(squad);
  const done = squad.state === "Completed";
  const notOpenYet = now !== null && now < squad.roundOpensAt;
  const owed = squad.myOwed;

  const action = done ? null : iPaid ? (
    <p className={PAID_LABEL}>{t("paidRound", { round: r })}</p>
  ) : notOpenYet ? (
    <p className={PAID_LABEL}>
      <span>{rich(t("roundOpensIn", { round: r }), { time: <Countdown to={squad.roundOpensAt} /> })}</span>
    </p>
  ) : (
    <Link href={`/s/${slug}/pay`} className={PALM_BTN}>
      {t("payAmount", { amount: naira(squad.contribution) })}
    </Link>
  );

  return (
    <AppShell action={action}>
      <header>
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
        <p className="mt-2 font-mono text-xs text-muted">
          {rich(t("squadMeta"), {
            status: done ? t("metaCompleted") : t("metaRound", { round: r, total: squad.members.length }),
            amount: <span className="font-money text-[13px] font-bold text-ink">{naira(squad.contribution)}</span>,
            period: t(`period${squad.period}`),
          })}
        </p>
      </header>

      {owed > 0 && (
        <section aria-label={t("payBackAria")} className="mt-8 rounded-md border border-bad/40 bg-bad/8 p-4">
          <p className="text-sm">{rich(t("payBackBody", { round: lastMiss(squad), names: creditorNames(squad, t("aMember")) }), { amount: <span className="font-money font-bold">{naira(owed)}</span> })}</p>
          <div className="mt-3">
            <ErrorNote error={back.error} />
            {me && me.balance < owed ? (
              <AddMoneyNote short={owed - me.balance} balance={me.balance} next={`/s/${slug}`} />
            ) : (
              <button type="button" disabled={back.busy} onClick={() => back.run(() => payBack(slug))} className={PALM_BTN}>
                {back.busy ? t("payingBack") : t(back.error ? "retryAmount" : "payBackAmount", { amount: naira(owed) })}
              </button>
            )}
          </div>
        </section>
      )}

      {done ? (
        <section className="mt-10">
          <p className="font-display text-3xl font-extrabold tracking-[-0.03em]">{t("everyoneCollected")}</p>
          <p className="mt-2 max-w-[34ch] text-muted">
            {t("completedBody")}
          </p>
        </section>
      ) : (
        <section aria-labelledby="next-payout" className="mt-10">
          <h2 id="next-payout" className="font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
            {rich(collector.id === ME ? t("youCollectIn") : t("nameCollectsIn", { name: collector.name }), { time: <Countdown to={squad.roundDeadline} /> })}
          </h2>
          <p className="mt-2 font-money text-[clamp(4rem,23vw,7rem)] leading-[0.9] font-bold tracking-[-0.02em] tnum">
            {naira(payoutAmount(squad))}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t("jarPaysAuto")}
          </p>
        </section>
      )}

      {!done && (
        <section aria-labelledby="this-round" className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 id="this-round" className="font-semibold">
              {t("thisRound")}
            </h2>
            <p className="font-mono text-xs text-muted tnum">
              {t("nOfMPaid", { paid: paidIds.length, total: squad.members.length })}
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
                    <EmptyBox size="lg" label={t("hasntPaidYet", { name: m.name })} />
                  )}
                  <span className={`max-w-full truncate text-xs ${m.id === ME ? "font-bold" : ""}`}>
                    {m.id === ME ? t("you") : m.name}
                  </span>
                </li>
              );
            })}
          </ul>
          {paidIds.length < squad.members.length && <RemindSquad squad={squad} />}
        </section>
      )}

      {!done && <AutopayToggle squad={squad} />}

      <section aria-labelledby="card" className="mt-12">
        <h2 id="card" className="mb-3 font-semibold">
          {t("theCard")}
        </h2>
        <StampCard squad={squad} fresh={fresh} />
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <LockSimple size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <HeldLine squad={squad} />
          </span>
        </p>
        {squad.myCredit > 0 && <p className="mt-2 text-sm text-muted">{t("creditLine", { amount: naira(squad.myCredit) })}</p>}
      </section>
    </AppShell>
  );
}

const TIER_OF_ALLOWANCE: Record<number, Tier> = { 0: "New", 25: "Building", 50: "Reliable" };

/** The latest round I missed that someone else collected: the one my debt most likely comes from. */
const lastMiss = (q: Squad) => Math.max(0, ...Object.entries(q.missed).filter(([r, ids]) => ids.includes(ME) && collectorOf(q, Number(r))?.id !== ME).map(([r]) => Number(r)));
/** Who a pay back reaches: members with credit, in turn order. */
const creditorNames = (q: Squad, fallback: string) => q.members.filter((m) => q.creditors.includes(m.id)).map((m) => m.name).join(", ") || fallback;

/** My held money: what will wait in the jar at my turn, what waits now, or that it came back. */
function HeldLine({ squad: q }: { squad: Squad }) {
  const t = useT();
  const turn = myTurn(q);
  if (q.state === "Completed") return t("heldReturned");
  if (q.currentRound <= turn) {
    const held = heldAtMyTurn(q);
    const tier = t(`tier${TIER_OF_ALLOWANCE[q.myAllowance] ?? "New"}`);
    return held > 0 ? t("heldPreview", { amount: naira(held), tier, turn }) : t("heldNoneLast", { turn });
  }
  return q.myHeld > 0 ? t("heldWaits", { amount: naira(q.myHeld), turn }) : t("heldNone", { turn });
}

function RemindSquad({ squad }: { squad: Squad }) {
  const origin = useOrigin();
  const t = useT();
  const r = squad.currentRound;
  const waiting = squad.members.filter((m) => !(squad.paid[r] ?? []).includes(m.id) && m.id !== ME);
  const remind = useRemind();
  if (!waiting.length) return null;
  const text = t("remindText", {
    names: waiting.map((m) => m.name).join(", "),
    amount: naira(squad.contribution),
    squad: squad.name,
    collector: collectorOf(squad).name,
    link: `${origin}/s/${squad.slug}/pay`,
  });
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      onClick={(e) => {
        if (!remind || !squad.address || squad.state !== "Active") return; // demo: the template link as is
        // Ask the server (in my language) only on tap. Open the tab now, inside the click, so it isn't
        // blocked; point it at the server's link, or the template if that takes over 2s or fails.
        e.preventDefault();
        const fallback = e.currentTarget.href;
        const w = window.open("", "_blank");
        if (w) w.opener = null;
        const late = new Promise<null>((r) => setTimeout(() => r(null), 2000));
        Promise.race([remind(squad.slug).catch(() => null), late]).then((url) => {
          if (w) w.location.href = url ?? fallback;
          else window.location.href = url ?? fallback;
        });
      }}
      target="_blank"
      rel="noreferrer"
      className="mt-5 inline-flex min-h-12 items-center gap-2 font-semibold text-ink underline decoration-rule decoration-2 hover:decoration-ink"
    >
      <WhatsappLogo size={20} aria-hidden />
      {waiting.length === 1 ? t("remindOne", { name: waiting[0].name }) : t("remindMany", { n: waiting.length })}
    </a>
  );
}

function SquadSkeleton() {
  const t = useT();
  return (
    <AppShell action={<Bar className="h-14 w-full rounded-lg" />}>
      <div aria-busy="true" aria-label={t("loadingSquad")}>
        <Bar className="h-[2.1rem] w-56" />
        <Bar className="mt-2 h-4 w-48" />
        <Bar className="mt-10 h-8 w-64" />
        <Bar className="mt-2 h-[clamp(4rem,23vw,7rem)] w-full max-w-72" />
        <Bar className="mt-2 h-4 w-60" />
        <div className="mt-8 flex items-baseline justify-between">
          <h2 className="font-semibold">{t("thisRound")}</h2>
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
        <h2 className="mt-12 mb-3 font-semibold">{t("theCard")}</h2>
        <Bar className="h-40 w-full rounded-lg" />
      </div>
    </AppShell>
  );
}
