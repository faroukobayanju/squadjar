"use client";

import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";
import { StampCard } from "@/components/stamp-card";
import { naira } from "@/lib/format";
import { useSampleSquad } from "@/lib/data";

export default function Landing() {
  const sample = useSampleSquad();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      <header className="flex h-16 items-center justify-between">
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">Squadjar</span>
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold underline decoration-rule decoration-2 hover:decoration-ink">
          Log in
        </Link>
      </header>

      <section className="grid items-center gap-10 pt-8 pb-16 md:grid-cols-[1.05fr_1fr] md:gap-14 md:pt-16">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(2.6rem,8vw,4.4rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
            Ajo with your squad. Nobody holds the jar.
          </h1>
          <p className="mt-5 max-w-[36ch] text-lg text-muted">
            Everyone pays in each round, one person collects, and the jar pays out on time by itself.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex min-h-14 items-center rounded-lg bg-ink px-7 font-semibold text-manila transition-transform active:scale-[0.98]"
          >
            Start a squad
          </Link>
        </div>
        {sample && (
          <figure className="min-w-0">
            <div className="md:-rotate-1">
              <StampCard squad={sample} />
            </div>
            <figcaption className="mt-3 text-sm text-muted">
              An example squad card: {sample.members.length} classmates, {naira(sample.contribution)} a week. Every box is
              stamped when someone pays.
            </figcaption>
          </figure>
        )}
      </section>

      <section className="border-t border-rule py-16">
        <h2 className="mb-8 font-display text-[clamp(1.9rem,5vw,2.8rem)] leading-[1] font-extrabold tracking-[-0.03em] text-balance">How it works</h2>
        <HowItWorks />
      </section>

      <section className="grid gap-10 border-t border-rule py-16 md:grid-cols-2">
        <h2 className="font-display text-[clamp(1.9rem,5vw,2.8rem)] leading-[1] font-extrabold tracking-[-0.03em] text-balance">
          What if someone stops paying?
        </h2>
        <div className="grid gap-5 text-lg">
          <p>
            Everyone locks a refundable deposit before round one. If a member misses, their deposit covers it, so the person
            collecting still gets the full amount.
          </p>
          <p className="text-muted">
            There is no treasurer to chase and no account to empty. The money sits in the jar until it&apos;s your turn.
          </p>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule py-8 text-sm text-muted">
        <span>Squadjar runs on test money while we pilot with student squads.</span>
        <Link href="/login" className="font-semibold text-ink underline">
          Start a squad
        </Link>
      </footer>
    </div>
  );
}
