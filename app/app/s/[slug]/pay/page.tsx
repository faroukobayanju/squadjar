"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink, useRequireLogin } from "@/components/shell";
import { Countdown, useNow } from "@/components/countdown";
import { AddMoneyNote, ErrorNote, PAID_LABEL, PALM_BTN } from "@/components/squad/ui";
import { friendlyError } from "@/lib/errors";
import { EmptyBox, Stamp } from "@/components/stamp";
import { Bar } from "@/components/skeleton";
import { naira } from "@/lib/format";
import { DemoError, ME, collectorOf, useActions, useMe, useSquad } from "@/lib/data";

export default function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const squad = useSquad(slug);
  const me = useMe();
  const { pay: payRound } = useActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const gated = useRequireLogin();
  if (gated) return null;

  if (squad === undefined || (squad && !me)) {
    return (
      <Frame slug={slug}>
        <div aria-busy="true" aria-label="Loading">
          <Bar className="mt-4 h-8 w-56" />
          <Bar className="mt-1 h-[clamp(3.6rem,19vw,5rem)] w-48" />
          <Bar className="mt-8 h-36 w-full" />
        </div>
        <Bar className="mt-auto h-14 w-full rounded-lg" />
      </Frame>
    );
  }

  if (!squad || squad.state !== "Active") {
    return (
      <Frame slug={slug}>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Nothing to pay here.</h1>
        <p className="mt-2 text-muted">This squad isn&apos;t collecting right now.</p>
      </Frame>
    );
  }

  const balance = me!.balance;
  const r = squad.currentRound;
  const alreadyPaid = (squad.paid[r] ?? []).includes(ME);
  const short = squad.contribution - balance;
  const collector = collectorOf(squad);
  const paidCount = (squad.paid[r] ?? []).length;
  const notOpenYet = now !== null && now < squad.roundOpensAt;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await payRound(slug);
      router.push(res.settled ? `/s/${slug}/payout` : `/s/${slug}`);
    } catch (e) {
      setError(e instanceof DemoError ? e.message : friendlyError(e, "payment"));
      setBusy(false);
    }
  }

  return (
    <Frame slug={slug} label={squad.name}>
      <h1 className="mt-4 font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
        Round {r} contribution
      </h1>
      <p className="mt-1 font-money text-[clamp(3.6rem,19vw,5rem)] leading-[0.95] font-bold tnum">{naira(squad.contribution)}</p>

      <dl className="mt-8 divide-y divide-rule border-y border-rule text-sm">
        <Row k="Goes into" v={`${squad.name} jar`} />
        <Row k="This round's collector" v={collector.id === ME ? "You" : collector.name} />
        <Row k="Your balance after" v={naira(Math.max(0, balance - squad.contribution))} />
      </dl>

      <div className="mt-8">
        <p className="text-sm text-muted">
          {paidCount === squad.members.length - 1 && !alreadyPaid
            ? "Everyone else has paid. Yours completes the round."
            : `${paidCount} of ${squad.members.length} have paid round ${r}.`}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Who has paid this round">
          {squad.members.map((m) =>
            (squad.paid[r] ?? []).includes(m.id) ? (
              <li key={m.id}><Stamp memberId={m.id} name={m.name} round={r} /></li>
            ) : (
              <li key={m.id}><EmptyBox label={`${m.id === ME ? "You haven't" : `${m.name} hasn't`} paid`} /></li>
            ),
          )}
        </ul>
      </div>

      {!alreadyPaid && (
        <div className="mt-10 flex items-center gap-4">
          <EmptyBox size="lg" label="Your box for this round" />
          <p className="max-w-[24ch] text-sm text-muted">Your stamp lands here when you pay.</p>
        </div>
      )}

      <div className="mt-auto pt-10">
        <ErrorNote error={error} />
        {alreadyPaid ? (
          <p className="text-center font-semibold text-muted">You&apos;ve paid round {r}.</p>
        ) : notOpenYet ? (
          <p className={PAID_LABEL}>
            <span>
              Round {r} opens in <Countdown to={squad.roundOpensAt} />
            </span>
          </p>
        ) : short > 0 ? (
          <AddMoneyNote short={short} balance={balance} next={`/s/${slug}/pay`} />
        ) : (
          <button type="button" onClick={pay} disabled={busy} className={PALM_BTN}>
            {busy ? "Stamping…" : error ? `Retry ${naira(squad.contribution)}` : `Pay ${naira(squad.contribution)}`}
          </button>
        )}
      </div>
    </Frame>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

function Frame({ slug, label = "Squad", children }: { slug: string; label?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href={`/s/${slug}`} label={label} />
      <main className="mt-2 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
