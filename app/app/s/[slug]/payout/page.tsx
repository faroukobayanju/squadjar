"use client";

import { use } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { WhatsappLogo } from "@phosphor-icons/react";
import { dueLabel, naira } from "@/lib/format";
import { useLastPayout } from "@/lib/data";
import { useLang, useT } from "@/lib/i18n";

export default function PayoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const payout = useLastPayout();
  const reduce = useReducedMotion();
  const t = useT();
  const lang = useLang();

  if (!payout || payout.slug !== slug) {
    return (
      <Wrap>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">{t("noPayout")}</h1>
        <p className="mt-2 text-muted">{t("noPayoutBody")}</p>
        <Link href={`/s/${slug}`} className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
          {t("backToSquad")}
        </Link>
      </Wrap>
    );
  }

  const share = t("payoutShare", { squad: payout.squadName, amount: naira(payout.amount), round: payout.round });

  return (
    <Wrap>
      <h1 className="mt-8 font-display text-[clamp(2.6rem,12vw,3.2rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
        {t("yourTurnLanded")}
      </h1>
      <p className="mt-5 font-money text-[clamp(3.6rem,19vw,5rem)] leading-none font-bold tnum">{naira(payout.amount)}</p>
      <p className="mt-2 font-mono text-xs text-muted">
        {t("payoutMeta", { squad: payout.squadName, round: payout.round })}
      </p>

      <div className="relative mt-8 overflow-hidden rounded-lg border border-rule bg-paper px-4 pt-2 pb-16">
        <motion.span
          aria-hidden
          className="ink ink-2 absolute right-4 bottom-4 border-[3px] border-stamp px-3 py-1 font-mono text-lg font-medium tracking-[0.08em] text-stamp"
          initial={reduce ? false : { scale: 2.2, rotate: -26, opacity: 0 }}
          animate={{ scale: 1, rotate: -12, opacity: 0.88 }}
          transition={{ type: "spring", stiffness: 420, damping: 20, delay: 0.25 }}
        >
          {t("collectedMark")}
        </motion.span>
        <dl className="divide-y divide-dashed divide-rule font-mono text-[13px]">
          <Row k={t("fromSquad")} v={naira(payout.amount - payout.covered)} />
          <Row k={t("coveredByDeposits")} v={naira(payout.covered)} />
          <Row k={t("sentTo")} v={t("yourBalance")} />
          <Row k={t("time")} v={dueLabel(payout.at, lang)} />
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
          {t("tellSquad")}
        </a>
        <Link
          href={`/s/${slug}`}
          className="flex min-h-13 items-center justify-center rounded-lg border-[1.5px] border-ink font-semibold active:scale-[0.98]"
        >
          {t("backToSquad")}
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
