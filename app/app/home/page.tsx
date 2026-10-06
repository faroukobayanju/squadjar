"use client";

import Link from "next/link";
import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { naira } from "@/lib/format";
import { Bar, SquadListSkeleton } from "@/components/skeleton";
import { isLive, useMe, useSquads } from "@/lib/data";
import { rich, useT } from "@/lib/i18n";

const SECONDARY = "font-semibold underline decoration-rule decoration-2 underline-offset-4";

export default function Home() {
  const me = useMe();
  const squads = useSquads();
  const t = useT();
  if (!me || !squads) return <HomeSkeleton />;
  return (
    <AppShell>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("homeHi", { name: me.name })}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">
          {rich(t("homeBalance"), { amount: <span className="font-money text-base font-bold text-ink tnum">{naira(me.balance)}</span> })}
        </span>
        <Link href="/add-money" className="font-semibold text-palm underline decoration-2 underline-offset-4">
          {t("addMoney")}
        </Link>
        {isLive && (
          <>
            <Link href="/send" className={SECONDARY}>
              {t("send")}
            </Link>
            <Link href="/withdraw" className={SECONDARY}>
              {t("withdraw")}
            </Link>
          </>
        )}
        <Link href="/history" className={SECONDARY}>
          {t("history")}
        </Link>
      </p>
      <Link
        href="/profile"
        className="mt-4 inline-flex min-h-9 items-center rounded-full border-[1.5px] border-stamp px-3 font-mono text-xs font-medium text-stamp"
      >
        {t("homeTierLine", { tier: t(`tier${me.tier}`), count: me.onTime })}
      </Link>

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
      <Bar className="mt-3 h-5 w-48" />
      <Bar className="mt-4 h-9 w-40 rounded-full" />
      <h2 className="mt-10 mb-3 font-semibold">{t("yourSquads")}</h2>
      <SquadListSkeleton />
    </AppShell>
  );
}
