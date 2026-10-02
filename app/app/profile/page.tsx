"use client";

import { AppShell } from "@/components/shell";
import { resetDemo, useStore, type Tier } from "@/lib/store";

const TIERS: { tier: Tier; points: string; means: string }[] = [
  { tier: "New", points: "under 5", means: "You start in later turns while you build a record." },
  { tier: "Building", points: "5 to 19", means: "Earlier turns open up." },
  { tier: "Reliable", points: "20 and up", means: "First turns, and a smaller deposit." },
];

export default function Profile() {
  const me = useStore((s) => s.me);
  return (
    <AppShell>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{me.name}</h1>
      <p className="mt-6 font-money text-6xl leading-none font-bold tnum">{me.onTime}</p>
      <p className="mt-1 text-muted">payments on time across all your squads</p>

      <h2 className="mt-10 font-semibold">How turns are earned</h2>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">
        Each on-time payment is a point. Late costs 2, a miss costs 10. Weekly and monthly squads count; quick demo squads
        don&apos;t.
      </p>
      <ol className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {TIERS.map((t) => (
          <li key={t.tier} className="flex gap-4 px-4 py-3">
            <span
              className={`mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] px-2.5 font-mono text-xs ${t.tier === me.tier ? "border-stamp bg-stamp/10 text-stamp" : "border-rule text-muted"}`}
            >
              {t.tier}
            </span>
            <span className="text-sm">
              <span className="font-semibold">{t.points} points.</span> {t.means}
            </span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          if (confirm("Reset the demo squads and balance?")) resetDemo();
        }}
        className="mt-10 min-h-12 text-sm font-semibold text-muted underline"
      >
        Reset demo data
      </button>
    </AppShell>
  );
}
