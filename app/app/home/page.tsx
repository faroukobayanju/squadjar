"use client";

import Link from "next/link";
import { Bank, ClockCounterClockwise, PaperPlaneTilt, Plus } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { naira } from "@/lib/format";
import { Bar, SquadListSkeleton } from "@/components/skeleton";
import { isLive, useMe, useSquads } from "@/lib/data";
import { rich, useT } from "@/lib/i18n";

// Send and withdraw need the live app; the demo hides them rather than leading to a form that can't finish.
const ACTIONS = [
  { href: "/add-money", label: "addMoney", icon: Plus },
  ...(isLive
    ? ([
        { href: "/send", label: "send", icon: PaperPlaneTilt },
        { href: "/withdraw", label: "withdraw", icon: Bank },
      ] as const)
    : []),
  { href: "/history", label: "history", icon: ClockCounterClockwise },
] as const;

export default function Home() {
  const me = useMe();
  const squads = useSquads();
  const t = useT();
  if (!me || !squads) return <HomeSkeleton />;
  return (
    <AppShell>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("homeHi", { name: me.name })}</h1>
      <Link
        href="/profile"
        className="mt-3 inline-flex min-h-9 items-center rounded-full border-[1.5px] border-stamp px-3 font-mono text-xs font-medium text-stamp"
      >
        {t("homeTierLine", { tier: t(`tier${me.tier}`), count: me.onTime })}
      </Link>

      <div className="mt-8">
        <p className="text-sm text-muted">
          {rich(t("homeBalance"), { amount: <span className="mt-1 block font-money text-[clamp(2.6rem,13vw,3.25rem)] leading-none font-bold text-ink tnum">{naira(me.balance)}</span> })}
        </p>
        <div className={`mt-5 grid gap-1.5 ${ACTIONS.length === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
          {ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[clamp(11px,3.2vw,13px)] font-semibold whitespace-nowrap transition-transform active:scale-[0.98] ${href === "/add-money" ? "bg-palm text-on-palm active:bg-palm-press" : "border-[1.5px] border-rule bg-paper"}`}
            >
              <Icon size={22} aria-hidden />
              {t(label)}
            </Link>
          ))}
        </div>
      </div>

      <h2 className="mt-10 mb-3 font-semibold">{t("yourSquads")}</h2>
      {squads.length ? (
        <SquadList squads={squads} />
      ) : (
        <p className="text-muted">{t("homeEmpty")}</p>
      )}
    </AppShell>
  );
}

function HomeSkeleton() {
  const t = useT();
  return (
    <AppShell>
      <Bar className="h-[2.1rem] w-44" />
      <Bar className="mt-3 h-9 w-40 rounded-full" />
      <Bar className="mt-8 h-5 w-16" />
      <Bar className="mt-1 h-[3.25rem] w-48" />
      <Bar className="mt-5 h-16 w-full rounded-lg" />
      <h2 className="mt-10 mb-3 font-semibold">{t("yourSquads")}</h2>
      <SquadListSkeleton />
    </AppShell>
  );
}
