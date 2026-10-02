"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/shell";
import { EmptyBox, Stamp } from "@/components/stamp";
import { naira } from "@/lib/format";
import { DemoError, ME, collectorOf, payRound, squadBySlug, useStore } from "@/lib/store";

export default function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const state = useStore((s) => s);
  const squad = squadBySlug(state, slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!squad || squad.state !== "Active") {
    return (
      <Frame slug={slug}>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Nothing to pay here.</h1>
        <p className="mt-2 text-muted">This squad isn&apos;t collecting right now.</p>
      </Frame>
    );
  }

  const r = squad.currentRound;
  const alreadyPaid = (squad.paid[r] ?? []).includes(ME);
  const short = squad.contribution - state.balance;
  const collector = collectorOf(squad);
  const paidCount = (squad.paid[r] ?? []).length;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await new Promise((ok) => setTimeout(ok, 650)); // network-shaped pause so the press reads as a real action
      const res = payRound(slug);
      router.push(res.settled ? `/s/${slug}/payout` : `/s/${slug}`);
    } catch (e) {
      setError(e instanceof DemoError ? e.message : "Payment didn't go through. Your money is safe. Try again.");
      setBusy(false);
    }
  }

  return (
    <Frame slug={slug}>
      <p className="font-semibold">{squad.name}</p>
      <h1 className="mt-6 font-display text-[1.6rem] leading-tight font-extrabold tracking-[-0.03em]">
        Round {r} contribution
      </h1>
      <p className="mt-1 font-money text-[clamp(3.6rem,19vw,5rem)] leading-[0.95] font-bold tnum">{naira(squad.contribution)}</p>

      <dl className="mt-8 divide-y divide-rule border-y border-rule text-sm">
        <Row k="Goes into" v={`${squad.name} jar`} />
        <Row k="This round's collector" v={collector.id === ME ? "You" : collector.name} />
        <Row k="Your balance after" v={naira(Math.max(0, state.balance - squad.contribution))} />
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

      <div className="mt-auto pt-10">
        {error && (
          <p role="alert" className="mb-4 rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        {alreadyPaid ? (
          <p className="text-center font-semibold text-muted">You&apos;ve paid round {r}.</p>
        ) : short > 0 ? (
          <>
            <p className="mb-3 text-sm">
              You need {naira(short)} more. Your balance is {naira(state.balance)}.
            </p>
            <Link
              href={`/add-money?amount=${Math.ceil(short / 100) * 100}&next=/s/${slug}/pay`}
              className="flex min-h-14 items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]"
            >
              Add {naira(Math.ceil(short / 100) * 100)}
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={pay}
            disabled={busy}
            className="flex min-h-14 w-full items-center justify-center rounded-lg bg-palm font-money text-[1.25rem] font-bold text-on-palm transition-transform duration-75 active:scale-[0.98] active:bg-palm-press disabled:opacity-70"
          >
            {busy ? "Stamping…" : `Pay ${naira(squad.contribution)}`}
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

function Frame({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href={`/s/${slug}`} label="Squad" />
      <main className="mt-2 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
