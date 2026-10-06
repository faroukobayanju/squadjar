"use client";

import Link from "next/link";
import { Bell } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { dayLabel, naira, timeLabel } from "@/lib/format";
import { Bar, SquadListSkeleton } from "@/components/skeleton";
import { isLive, useMe, useNotifications, useSquads } from "@/lib/data";
import { rich, useLang, useT } from "@/lib/i18n";

const SECONDARY = "font-semibold underline decoration-rule decoration-2 underline-offset-4";

export default function Home() {
  const me = useMe();
  const squads = useSquads();
  const t = useT();
  if (!me || !squads) return <HomeSkeleton />;
  return (
    <AppShell>
      <div className="relative flex items-start justify-between gap-3">
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("homeHi", { name: me.name })}</h1>
        {isLive && <Inbox />}
      </div>
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

/** In-app pay nudges from the nudge cron, behind a bell. */
function Inbox() {
  const list = useNotifications();
  const t = useT();
  const lang = useLang();
  if (!list) return null;
  return (
    <details className="group shrink-0">
      <summary aria-label={t("inbox")} className="flex size-11 cursor-pointer list-none items-center justify-center gap-1 rounded-full border-[1.5px] border-rule [&::-webkit-details-marker]:hidden">
        <Bell size={20} weight={list.length ? "fill" : "regular"} aria-hidden />
        {list.length > 0 && <span className="font-mono text-xs font-medium tnum">{list.length}</span>}
      </summary>
      <section aria-label={t("inbox")} className="absolute inset-x-0 top-full z-10 mt-2 max-h-[60dvh] overflow-y-auto rounded-lg border border-rule bg-paper p-4">
        <h2 className="mb-2 font-semibold">{t("inbox")}</h2>
        {list.length ? (
          <ul className="grid gap-3">
            {list.map((n) => (
              <li key={`${n.squad}:${n.sentAt}:${n.body}`} className="text-sm">
                <Link href={`/s/${n.slug}/pay`} className="block">
                  <span className="block font-mono text-xs text-muted">
                    {n.squadName} · {dayLabel(Date.parse(n.sentAt), undefined, lang, [t("today"), t("yesterday")])} {timeLabel(Date.parse(n.sentAt), lang)}
                  </span>
                  {n.body}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("inboxEmpty")}</p>
        )}
      </section>
    </details>
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
