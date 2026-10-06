"use client";

import Link from "next/link";
import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { SquadListSkeleton } from "@/components/skeleton";
import { MIN_TIER_KEY, naira } from "@/lib/format";
import { isLive, usePublicSquads, useSquads, type Squad } from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function Squads() {
  const squads = useSquads();
  const t = useT();
  return (
    <AppShell>
      <h1 className="mb-6 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("squads")}</h1>
      {squads ? <SquadList squads={squads} /> : <SquadListSkeleton />}
      {isLive && <FindSquad mine={squads} />}
    </AppShell>
  );
}

function FindSquad({ mine }: { mine?: Squad[] }) {
  const all = usePublicSquads();
  const t = useT();
  const list = all?.filter((p) => !mine?.some((q) => q.slug === p.slug));
  return (
    <section aria-labelledby="find" className="mt-12">
      <h2 id="find" className="mb-3 font-semibold">
        {t("findSquad")}
      </h2>
      {list === undefined ? (
        <SquadListSkeleton rows={1} />
      ) : !list?.length ? (
        <p className="text-sm text-muted">{all === null ? t("findLoadFail") : t("findNone")}</p>
      ) : (
        <ul className="grid gap-3">
          {list.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/s/${p.slug}`}
                className="block rounded-lg border border-rule bg-paper px-4 py-4 transition-colors hover:border-ink/40 active:scale-[0.99]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate font-display text-[1.25rem] font-extrabold tracking-[-0.02em]">{p.name}</h3>
                  <span className="shrink-0 font-money text-lg font-bold tnum">{naira(p.contribution)}</span>
                </div>
                {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
                <p className="mt-2 flex items-center justify-between gap-3 font-mono text-xs">
                  <span className="text-muted">
                    {t("findSeats", { period: t(`period${p.period}`), left: p.maxMembers - p.members, max: p.maxMembers })}
                  </span>
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] border-rule px-2.5 font-mono text-xs text-muted">
                    {t(MIN_TIER_KEY[p.minTier])}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
