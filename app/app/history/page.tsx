"use client";

import { usePrivy } from "@privy-io/react-auth";
import { AppShell, BackLink } from "@/components/shell";
import { Bar } from "@/components/skeleton";
import { dayLabel, naira, timeLabel } from "@/lib/format";
import { isLive } from "@/lib/data";
import { useMyAccount } from "@/lib/live/account";
import { usePoll } from "@/lib/live/squads";
import type { Kind } from "@/lib/activity-classify";
import { useLang, useT, type T } from "@/lib/i18n";

type Item = { tx: string; logIndex: number; kind: Kind; amount: number; round: number | null; at: string; squadName: string | null; slug: string | null; counterpartyName: string | null };

function useLiveHistory(): Item[] | undefined {
  const { getAccessToken } = usePrivy();
  const { address: me } = useMyAccount();
  return usePoll(me ? `history:${me}` : null, async () => {
    const token = await getAccessToken();
    const r = await fetch("/api/activity", { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`history ${r.status}`);
    return (await r.json()) as Item[];
  });
}
// isLive is a build-time constant; the demo has no history.
const useHistory: () => Item[] | undefined = isLive ? useLiveHistory : () => [];

const IN = new Set<Kind>(["topup", "payout", "refund", "received"]);

function label({ kind, round, squadName, counterpartyName: who }: Item, t: T) {
  const v = { squad: squadName ?? t("aSquad"), round: round ?? "", name: who ?? "" };
  switch (kind) {
    case "topup":
      return t("hAdded");
    case "deposit":
      return t("hDeposit", v);
    case "contribution":
      return t(round ? "hPaidRound" : "hPaid", v);
    case "payout":
      return t("hPayout", v);
    case "refund":
      return t("hRefund", v);
    case "covered":
      return t("hCovered", v);
    case "withdraw":
      return t("hWithdraw");
    case "sent":
      return t(who ? "hSentTo" : "hSent", v);
    case "received":
      return t(who ? "hFrom" : "hGot", v);
    case "stopped":
      return t("hStopped", v);
  }
}

export default function History() {
  const items = useHistory();
  const t = useT();
  const lang = useLang();
  const days: { day: string; items: Item[] }[] = [];
  for (const it of items ?? []) {
    const day = dayLabel(Date.parse(it.at), undefined, lang, [t("today"), t("yesterday")]);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }
  return (
    <AppShell>
      <BackLink href="/home" label={t("home")} />
      <h1 className="mt-2 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("history")}</h1>
      {!items ? (
        <div className="mt-8 grid gap-3" aria-busy="true" aria-label={t("loadingHistory")}>
          <Bar className="h-4 w-20" />
          <Bar className="h-14 w-full rounded-lg" />
          <Bar className="h-14 w-full rounded-lg" />
        </div>
      ) : !items.length ? (
        <p className="mt-8 max-w-[38ch] text-muted">{t("historyEmpty")}</p>
      ) : (
        days.map(({ day, items }) => (
          <section key={day} className="mt-8">
            <h2 className="mb-2 font-mono text-xs text-muted">{day}</h2>
            <ul className="divide-y divide-rule rounded-lg border border-rule bg-paper">
              {items.map((it) => {
                const plus = IN.has(it.kind);
                const fromDeposit = it.kind === "covered"; // came out of the locked deposit, not the balance
                return (
                  <li key={`${it.tx}:${it.logIndex}:${it.kind}`} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-semibold ${it.kind === "stopped" ? "text-muted" : ""}`}>{label(it, t)}</span>
                      <span className="block font-mono text-xs text-muted tnum">
                        {timeLabel(Date.parse(it.at), lang)}
                      </span>
                    </span>
                    {it.kind !== "stopped" && (
                      <span className={`shrink-0 font-money text-lg font-bold tnum ${plus ? "text-stamp" : fromDeposit ? "text-muted" : "text-ink"}`}>
                        {plus ? "+" : fromDeposit ? "" : "−"}
                        {naira(it.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </AppShell>
  );
}
