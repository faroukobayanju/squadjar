"use client";

import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";
import { StampCard } from "@/components/stamp-card";
import { naira } from "@/lib/format";
import { useSampleSquad } from "@/lib/data";
import { LanguagePicker } from "@/components/language-picker";
import { LogoMark } from "@/components/logo-mark";
import { useT } from "@/lib/i18n";

export default function Landing() {
  const sample = useSampleSquad();
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      <header className="flex h-16 items-center justify-between">
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">Squadjar</span>
        <div className="flex items-center gap-4">
          <LanguagePicker compact />
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold underline decoration-rule decoration-2 hover:decoration-ink">
            {t("logIn")}
          </Link>
        </div>
      </header>

      <section className="grid items-center gap-10 pt-8 pb-16 md:grid-cols-[1.05fr_1fr] md:gap-14 md:pt-16">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(2.6rem,8vw,4.4rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
            {t("landingTitle")}
          </h1>
          <p className="mt-5 max-w-[36ch] text-lg text-muted">
            {t("landingLead")}
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex min-h-14 items-center rounded-lg bg-ink px-7 font-semibold whitespace-nowrap text-manila transition-transform active:scale-[0.98]"
          >
            {t("startSquad")}
          </Link>
        </div>
        {sample && (
          <figure className="min-w-0">
            <div className="md:-rotate-1">
              <StampCard squad={sample} />
            </div>
            <figcaption className="mt-3 text-sm text-muted">
              {t("landingCaption", { count: sample.members.length, amount: naira(sample.contribution) })}
            </figcaption>
          </figure>
        )}
      </section>

      <section className="grid gap-8 border-t border-rule py-16 md:grid-cols-[1fr_1.6fr] md:gap-14">
        <div>
          <h2 className="font-display text-[clamp(1.9rem,5vw,2.8rem)] leading-[1] font-extrabold tracking-[-0.03em] text-balance">{t("howItWorks")}</h2>
          <p className="mt-4 max-w-[34ch] text-lg text-muted">{t("landingNoTreasurer")}</p>
        </div>
        <HowItWorks />
      </section>

      <footer className="grid gap-6 border-t border-rule py-10 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-center gap-4">
          <LogoMark className="size-14 shrink-0" />
          <p className="max-w-[36ch] text-sm text-muted">{t("landingFooter")}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex min-h-14 items-center justify-center rounded-lg bg-ink px-7 font-semibold whitespace-nowrap text-manila transition-transform active:scale-[0.98]"
        >
          {t("startSquad")}
        </Link>
      </footer>
    </div>
  );
}
