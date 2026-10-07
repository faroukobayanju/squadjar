"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/shell";
import { nextDue } from "@/lib/due";
import { naira } from "@/lib/format";
import { DemoError, friendlyError } from "@/lib/errors";
import { isLive, useActions, type Period } from "@/lib/data";
import { rich, useT, type Key } from "@/lib/i18n";

const PERIODS: { value: Period; label: Key }[] = [
  { value: "Weekly", label: "periodWeekly" },
  { value: "Monthly", label: "periodMonthly" },
  { value: "Demo", label: "periodDemoOption" },
];

// Mon first, as people say it; values are Date.getDay() (0 = Sunday).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: `day${d}` as Key }));
const HOURS = Array.from({ length: 24 }, (_, h) => ({ h, label: h < 12 ? ("hourAm" as const) : ("hourPm" as const), h12: h % 12 || 12 }));
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const PILL = "min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-semibold";
const pill = (on: boolean) => `${PILL} ${on ? "border-ink bg-ink text-manila" : "border-rule"}`;

export default function NewSquad() {
  const router = useRouter();
  const { createSquad } = useActions();
  const t = useT();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("5000");
  const [size, setSize] = useState("8");
  const [period, setPeriod] = useState<Period>("Weekly");
  const [weekday, setWeekday] = useState(5);
  const [monthDay, setMonthDay] = useState(25);
  const [weeklyHour, setWeeklyHour] = useState(18);
  const [monthlyHour, setMonthlyHour] = useState(9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const hour = period === "Monthly" ? monthlyHour : weeklyHour;
      const due = nextDue(period, { weekday, monthDay, hour }, new Date());
      const slug = await createSquad({ name, contribution: Number(amount.replace(/\D/g, "")), size: Number(size), period, due });
      router.push(`/s/${slug}`);
    } catch (err) {
      setError(isLive || err instanceof DemoError ? friendlyError(err, "other", t) : t("newCreateFail"));
      setBusy(false);
    }
  }

  const each = Number(amount.replace(/\D/g, "")) || 0;
  const n = Number(size) || 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href="/home" label={t("home")} />
      <h1 className="mt-2 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("startSquad")}</h1>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5">
        <Field id="name" label={t("squadName")}>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="amount" label={t("eachPays")}>
            <div className={`${INPUT} flex items-center`}>
              <span className="text-muted">₦</span>
              <input
                id="amount"
                inputMode="numeric"
                value={each ? each.toLocaleString("en-NG") : ""}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent pl-1 outline-none"
              />
            </div>
          </Field>
          <Field id="size" label={t("people")}>
            <input id="size" type="number" min={3} max={20} value={size} onChange={(e) => setSize(e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field id="period" label={t("howOften")}>
          <select id="period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={INPUT}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.label)}
              </option>
            ))}
          </select>
        </Field>

        {period === "Weekly" && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t("dueDay")}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ d, label }) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={weekday === d}
                  onClick={() => setWeekday(d)}
                  className={pill(weekday === d)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <HourSelect id="weekly-hour" value={weeklyHour} onChange={setWeeklyHour} />
          </fieldset>
        )}
        {period === "Monthly" && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("dueDay")}</legend>
            <div className="grid grid-cols-2 gap-3">
              <select aria-label={t("dayOfMonth")} value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} className={INPUT}>
                {MONTH_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {t("dayN", { d })}
                  </option>
                ))}
              </select>
              <HourSelect id="monthly-hour" value={monthlyHour} onChange={setMonthlyHour} />
            </div>
          </fieldset>
        )}

        {each > 0 && n >= 3 && (
          <p className="text-sm text-muted">
            {rich(t("newPayoutLine", { n }), { amount: <span className="font-money font-bold text-ink">{naira(each * n)}</span> })}
          </p>
        )}

        <div className="mt-auto">
          {error && (
            <p role="alert" className="mb-4 rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-14 w-full items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98] disabled:opacity-70"
          >
            {busy ? t("creating") : t("createSquad")}
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT = "min-h-[52px] w-full rounded-md border-[1.5px] border-muted/60 bg-paper px-3 focus-within:border-stamp focus:border-stamp outline-none";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

function HourSelect({ id, value, onChange }: { id: string; value: number; onChange: (h: number) => void }) {
  const t = useT();
  return (
    <div>
      <select id={id} aria-label={t("time")} value={value} onChange={(e) => onChange(Number(e.target.value))} className={INPUT}>
        {HOURS.map(({ h, label, h12 }) => (
          <option key={h} value={h}>
            {t(label, { h: h12 })}
          </option>
        ))}
      </select>
      <p className="mt-1 font-mono text-xs text-muted">{t("watTime")}</p>
    </div>
  );
}
