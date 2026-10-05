"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell";
import { StopAutopayEverywhere } from "@/components/autopay-toggle";
import { Bar } from "@/components/skeleton";
import { useMyAccount } from "@/lib/live/account";
import { isLive, resetDemo, useMe, useRecords, type Tier } from "@/lib/data";
import { stoppedLine, type PayRecord } from "@/lib/record-line";

const TIERS: { tier: Tier; points: string; means: string }[] = [
  { tier: "New", points: "under 5", means: "You start in later turns while you build a record." },
  { tier: "Building", points: "5 to 19", means: "Earlier turns open up." },
  { tier: "Reliable", points: "20 and up", means: "First turns, and a smaller deposit." },
];

export default function Profile() {
  const me = useMe();
  const router = useRouter();
  const { logout, email } = useMyAccount();
  return (
    <AppShell>
      {me ? (
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{me.name}</h1>
      ) : (
        <Bar className="h-[2.1rem] w-40" />
      )}
      {me ? <p className="mt-6 font-money text-6xl leading-none font-bold tnum">{me.score}</p> : <Bar className="mt-6 h-[3.75rem] w-24" />}
      <p className="mt-1 text-muted">
        Trust score{me && `, ${me.tier} tier · ${me.onTime} paid on time across all your squads`}
      </p>

      {isLive && <YourRecord />}

      <h2 className="mt-10 font-semibold">How turns are earned</h2>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">
        Each on-time payment is a point. Late costs 2, a miss costs 10. Weekly and monthly squads of 5 or more people, at <span className="font-money font-bold">₦1,000</span> or more each, count.
      </p>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">Quick demo squads don&apos;t count toward your trust score.</p>
      <ol className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {TIERS.map((t) => (
          <li key={t.tier} className="flex gap-4 px-4 py-3">
            <span
              className={`mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] px-2.5 font-mono text-xs ${t.tier === me?.tier ? "border-stamp bg-stamp/10 text-stamp" : "border-rule text-muted"}`}
            >
              {t.tier}
            </span>
            <span className="text-sm">
              <span className="font-semibold">{t.points} points.</span> {t.means}
            </span>
          </li>
        ))}
      </ol>

      <Link href="/intro?next=/profile" className="mt-8 inline-flex min-h-12 items-center text-sm font-semibold underline">
        How Squadjar works
      </Link>
      <Link href="/history" className="flex min-h-12 items-center text-sm font-semibold underline">
        Money history
      </Link>

      <StopAutopayEverywhere />

      {isLive && email && (
        <p className="mt-10 text-sm text-muted">
          Signed in as <span className="font-semibold text-ink">{email}</span>. Each email is a separate account with its own balance.
        </p>
      )}
      {isLive && (
        <button
          type="button"
          onClick={() => logout().then(() => router.replace("/login"))}
          className={`${email ? "mt-2" : "mt-10"} min-h-12 text-sm font-semibold text-muted underline`}
        >
          Log out
        </button>
      )}

      {!isLive && (
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset the demo squads and balance?")) resetDemo();
          }}
          className={`${email ? "mt-2" : "mt-10"} min-h-12 text-sm font-semibold text-muted underline`}
        >
          Reset demo data
        </button>
      )}
    </AppShell>
  );
}

const ROWS: { key: keyof PayRecord; label: string }[] = [
  { key: "onTime", label: "Paid on time" },
  { key: "late", label: "Paid late" },
  { key: "missed", label: "Missed" },
  { key: "completed", label: "Squads completed" },
];

function YourRecord() {
  const { address } = useMyAccount();
  const record = useRecords(address ? [address] : [])?.[address?.toLowerCase() ?? ""];
  const stopped = stoppedLine(record);
  return (
    <section aria-labelledby="record" className="mt-10">
      <h2 id="record" className="font-semibold">
        Your record
      </h2>
      <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {ROWS.map(({ key, label }) => (
          <li key={key} className="flex min-h-12 items-center justify-between gap-3 px-4">
            <span className="text-sm">{label}</span>
            {record ? <span className="font-mono text-sm tnum">{record[key]}</span> : <Bar className="h-4 w-6" />}
          </li>
        ))}
        {stopped && <li className="flex min-h-12 items-center px-4 text-sm font-semibold text-bad">{stopped}</li>}
      </ul>
      <p className="mt-2 max-w-[42ch] text-sm text-muted">Quick demo squads don&apos;t count toward on-time and missed; stopping payment always shows.</p>
    </section>
  );
}
