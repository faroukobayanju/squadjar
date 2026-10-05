"use client";

import { use } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { WhatsappLogo } from "@phosphor-icons/react";
import { naira } from "@/lib/format";
import { useLastPayout } from "@/lib/data";

export default function PayoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const payout = useLastPayout();
  const reduce = useReducedMotion();

  if (!payout || payout.slug !== slug) {
    return (
      <Wrap>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">No payout to show yet.</h1>
        <p className="mt-2 text-muted">When the jar pays you, the receipt lands here.</p>
        <Link href={`/s/${slug}`} className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
          Back to squad
        </Link>
      </Wrap>
    );
  }

  const share = `The ${payout.squadName} jar just paid me ${naira(payout.amount)} for round ${payout.round}. Nobody held the money. Squadjar.`;

  return (
    <Wrap>
      <h1 className="mt-8 font-display text-[clamp(2.6rem,12vw,3.2rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
        Your turn landed.
      </h1>
      <p className="mt-5 font-money text-[clamp(3.6rem,19vw,5rem)] leading-none font-bold tnum">{naira(payout.amount)}</p>
      <p className="mt-2 font-mono text-xs text-muted">
        {payout.squadName} · Round {payout.round}
      </p>

      <div className="relative mt-8 overflow-hidden rounded-lg border border-rule bg-paper px-4 pt-2 pb-16">
        <motion.span
          aria-hidden
          className="ink ink-2 absolute right-4 bottom-4 border-[3px] border-stamp px-3 py-1 font-mono text-lg font-medium tracking-[0.08em] text-stamp"
          initial={reduce ? false : { scale: 2.2, rotate: -26, opacity: 0 }}
          animate={{ scale: 1, rotate: -12, opacity: 0.88 }}
          transition={{ type: "spring", stiffness: 420, damping: 20, delay: 0.25 }}
        >
          COLLECTED
        </motion.span>
        <dl className="divide-y divide-dashed divide-rule font-mono text-[13px]">
          <Row k="From the squad" v={naira(payout.amount - payout.covered)} />
          <Row k="Covered by deposits" v={naira(payout.covered)} />
          <Row k="Sent to" v="Your balance" />
          <Row k="Time" v={new Date(payout.at).toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" })} />
        </dl>
      </div>

      <div className="mt-auto grid gap-3 pt-10">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]"
        >
          <WhatsappLogo size={22} weight="fill" aria-hidden />
          Tell the squad
        </a>
        <Link
          href={`/s/${slug}`}
          className="flex min-h-13 items-center justify-center rounded-lg border-[1.5px] border-ink font-semibold active:scale-[0.98]"
        >
          Back to squad
        </Link>
      </div>
    </Wrap>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 pr-1">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}
