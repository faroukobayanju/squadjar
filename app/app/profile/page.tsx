"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell";
import { StopAutopayEverywhere } from "@/components/autopay-toggle";
import { Bar } from "@/components/skeleton";
import { useMyAccount } from "@/lib/live/account";
import { isLive, resetDemo, useMe, useRecords, type Tier } from "@/lib/data";
import { stoppedLine, type PayRecord } from "@/lib/record-line";
import { LanguagePicker } from "@/components/language-picker";
import { rich, useT, type Key } from "@/lib/i18n";

const TIERS: Tier[] = ["New", "Building", "Reliable"];

export default function Profile() {
  const me = useMe();
  const router = useRouter();
  const { logout, email } = useMyAccount();
  const t = useT();
  return (
    <AppShell>
      {me ? (
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{me.name}</h1>
      ) : (
        <Bar className="h-[2.1rem] w-40" />
      )}
      {me ? <p className="mt-6 font-money text-6xl leading-none font-bold tnum">{me.score}</p> : <Bar className="mt-6 h-[3.75rem] w-24" />}
      <p className="mt-1 text-muted">
        {me ? t("profileTrustLine", { tier: t(`tier${me.tier}`), count: me.onTime }) : t("trustScore")}
      </p>

      {isLive && <YourRecord />}

      <h2 className="mt-10 font-semibold">{t("howTurns")}</h2>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">
        {rich(t("howTurnsBody"), { amount: <span className="font-money font-bold">₦1,000</span> })}
      </p>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">{t("demoNoCount")}</p>
      <ol className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {TIERS.map((tier) => (
          <li key={tier} className="flex gap-4 px-4 py-3">
            <span
              className={`mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] px-2.5 font-mono text-xs ${tier === me?.tier ? "border-stamp bg-stamp/10 text-stamp" : "border-rule text-muted"}`}
            >
              {t(`tier${tier}`)}
            </span>
            <span className="text-sm">
              <span className="font-semibold">{t("tierPoints", { points: t(`points${tier}`) })}</span> {t(`means${tier}`)}
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="language" className="mt-10">
        <h2 id="language" className="mb-3 font-semibold">
          {t("language")}
        </h2>
        <LanguagePicker />
      </section>

      <Link href="/intro?next=/profile" className="mt-8 inline-flex min-h-12 items-center text-sm font-semibold underline">
        {t("howSquadjar")}
      </Link>
      <Link href="/history" className="flex min-h-12 items-center text-sm font-semibold underline">
        {t("moneyHistory")}
      </Link>

      <StopAutopayEverywhere />

      {isLive && email && (
        <p className="mt-10 text-sm text-muted">
          {rich(t("signedInAs"), { email: <span className="font-semibold text-ink">{email}</span> })}
        </p>
      )}
      {isLive && (
        <button
          type="button"
          onClick={() => logout().then(() => router.replace("/login"))}
          className={`${email ? "mt-2" : "mt-10"} min-h-12 text-sm font-semibold text-muted underline`}
        >
          {t("logOut")}
        </button>
      )}

      {!isLive && (
        <button
          type="button"
          onClick={() => {
            if (confirm(t("resetConfirm"))) resetDemo();
          }}
          className={`${email ? "mt-2" : "mt-10"} min-h-12 text-sm font-semibold text-muted underline`}
        >
          {t("resetDemo")}
        </button>
      )}
    </AppShell>
  );
}

const ROWS: { key: keyof PayRecord; label: Key }[] = [
  { key: "onTime", label: "recPaidOnTime" },
  { key: "late", label: "recPaidLate" },
  { key: "missed", label: "recMissed" },
  { key: "completed", label: "recCompleted" },
];

function YourRecord() {
  const { address } = useMyAccount();
  const record = useRecords(address ? [address] : [])?.[address?.toLowerCase() ?? ""];
  const t = useT();
  const stopped = stoppedLine(record, t);
  return (
    <section aria-labelledby="record" className="mt-10">
      <h2 id="record" className="font-semibold">
        {t("yourRecord")}
      </h2>
      <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {ROWS.map(({ key, label }) => (
          <li key={key} className="flex min-h-12 items-center justify-between gap-3 px-4">
            <span className="text-sm">{t(label)}</span>
            {record ? <span className="font-mono text-sm tnum">{record[key]}</span> : <Bar className="h-4 w-6" />}
          </li>
        ))}
        {stopped && <li className="flex min-h-12 items-center px-4 text-sm font-semibold text-bad">{stopped}</li>}
      </ul>
      <p className="mt-2 max-w-[42ch] text-sm text-muted">{t("recordNote")}</p>
    </section>
  );
}
