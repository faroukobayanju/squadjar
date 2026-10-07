"use client";

import { LockSimple } from "@phosphor-icons/react";
import { EmptyBox, PaidOutMark, Stamp } from "@/components/stamp";
import { useT } from "@/lib/i18n";
import type { Tier } from "@/lib/data";

// The four "how Squadjar works" steps: one source for the landing card and the /intro swipe deck.
export const HOW_IT_WORKS = [
  { title: "how1Title", body: "how1Body" },
  { title: "how2Title", body: "how2Body" },
  { title: "how3Title", body: "how3Body" },
  { title: "how4Title", body: "how4Body" },
] as const;

const TIERS: Tier[] = ["New", "Building", "Reliable"];
const SQUAD = [
  ["tolu", "Tolu"],
  ["chidi", "Chidi"],
  ["bola", "Bola"],
  ["femi", "Femi"],
] as const;

/** A tier pill: stamp ink when it's the tier you hold, pencil otherwise. */
export function TierPill({ tier, on }: { tier: Tier; on: boolean }) {
  const t = useT();
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] px-2.5 font-mono text-xs whitespace-nowrap ${on ? "border-stamp bg-stamp/10 text-stamp" : "border-rule text-muted"}`}
    >
      {t(`tier${tier}`)}
    </span>
  );
}

/** One step drawn with the card's own marks: stamps, an empty box, PAID OUT, the turn list, the tiers. */
export function HowVisual({ step, size = "sm" }: { step: number; size?: "sm" | "md" }) {
  const box = size === "md" ? "size-10" : "size-7";
  let art: React.ReactNode;
  if (step === 0)
    art = (
      <div className="flex gap-2.5">
        {SQUAD.map(([id, name]) => (
          <Stamp key={id} memberId={id} name={name} round={1} size={size} />
        ))}
      </div>
    );
  else if (step === 1)
    art = (
      <ol className={`grid ${size === "md" ? "gap-2 text-base" : "gap-1 text-sm"}`}>
        {SQUAD.slice(0, 3).map(([id, name], n) => (
          <li key={id} className="flex items-center gap-3">
            <span className="w-3 font-mono text-xs text-muted tnum">{n + 1}</span>
            <span className="w-14 font-semibold">{name}</span>
            {n === 0 ? <PaidOutMark /> : <EmptyBox size={size} label="" />}
          </li>
        ))}
      </ol>
    );
  else if (step === 2)
    art = (
      <div className="flex items-center gap-2.5">
        {SQUAD.slice(0, 3).map(([id, name]) => (
          <Stamp key={id} memberId={id} name={name} round={2} size={size} />
        ))}
        <span className={`grid place-items-center rounded-sm border-[1.5px] border-dashed border-muted/70 text-ink ${box}`}>
          <LockSimple size={size === "md" ? 18 : 14} weight="bold" />
        </span>
      </div>
    );
  else
    art = (
      <div className="flex flex-wrap gap-2">
        {TIERS.map((tier) => (
          <TierPill key={tier} tier={tier} on={tier === "Reliable"} />
        ))}
      </div>
    );
  return <div aria-hidden>{art}</div>;
}

/** The landing's "How it works": one ruled card, a row per step, each with its own mark. */
export function HowItWorks() {
  const t = useT();
  return (
    <ol className="divide-y divide-rule rounded-lg border border-rule bg-paper">
      {HOW_IT_WORKS.map((c, i) => (
        <li key={c.title} className="grid gap-4 p-5 md:grid-cols-[14rem_1fr] md:items-center md:gap-8 md:p-6">
          <HowVisual step={i} />
          <div>
            <h3 className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] text-balance">{t(c.title)}</h3>
            <p className="mt-1.5 max-w-[46ch] text-muted">{t(c.body)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
