"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react";
import { BackLink } from "@/components/shell";
import { parseDraft } from "@/lib/draft";
import { nextDue } from "@/lib/due";
import { MIN_TIER_LABEL, naira } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { DemoError, isLive, useActions, type Period } from "@/lib/data";

const PERIODS: { value: Period; label: string }[] = [
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Demo", label: "Quick demo (5-minute rounds)" },
];

// Mon first, as people say it; values are Date.getDay() (0 = Sunday).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] }));
const HOURS = Array.from({ length: 24 }, (_, h) => ({ h, label: `${h % 12 || 12}:00 ${h < 12 ? "am" : "pm"}` }));
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const PILL = "min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-semibold";
const pill = (on: boolean) => `${PILL} ${on ? "border-ink bg-ink text-manila" : "border-rule"}`;

export default function NewSquad() {
  const router = useRouter();
  const { createSquad } = useActions();
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("5000");
  const [size, setSize] = useState("8");
  const [period, setPeriod] = useState<Period>("Weekly");
  const [weekday, setWeekday] = useState(5);
  const [monthDay, setMonthDay] = useState(25);
  const [weeklyHour, setWeeklyHour] = useState(18);
  const [monthlyHour, setMonthlyHour] = useState(9);
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [minTier, setMinTier] = useState(0);
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fill() {
    const d = parseDraft(ask);
    if (d.name) setName(d.name);
    if (d.contribution) setAmount(String(d.contribution));
    if (d.size) setSize(String(d.size));
    if (d.period) setPeriod(d.period);
    if (d.weekday !== undefined) setWeekday(d.weekday);
    const missing = [!d.contribution && "how much each person pays", !d.size && "how many of you", !d.period && "weekly or monthly"].filter(Boolean);
    setNote(missing.length ? `Filled what I could. Still need: ${missing.join(", ")}.` : "Filled in below. Check it, then create.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const hour = period === "Monthly" ? monthlyHour : weeklyHour;
      const due = nextDue(period, { weekday, monthDay, hour }, new Date());
      const pub = isPublic ? { description: description.trim() || null, minTier, approval } : undefined;
      const slug = await createSquad({ name, contribution: Number(amount.replace(/\D/g, "")), size: Number(size), period, due, pub });
      router.push(`/s/${slug}`);
    } catch (err) {
      setError(err instanceof DemoError ? err.message : isLive ? friendlyError(err, "other") : "Couldn't create the squad. Try again.");
      setBusy(false);
    }
  }

  const each = Number(amount.replace(/\D/g, "")) || 0;
  const n = Number(size) || 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href="/home" label="Home" />
      <h1 className="mt-2 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">Start a squad</h1>

      <section className="mt-6 rounded-lg border border-rule bg-paper p-4">
        <label htmlFor="ask" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkle size={18} weight="fill" className="text-stamp" aria-hidden />
          Describe it in your own words
        </label>
        <textarea
          id="ask"
          rows={2}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="8 of us, 5k every Friday, called CSC 300L Squad"
          className="mt-2 w-full resize-none rounded-md border border-rule bg-manila/40 px-3 py-2 placeholder:text-muted/80"
        />
        <button
          type="button"
          onClick={fill}
          disabled={!ask.trim()}
          className="mt-2 min-h-11 rounded-full border-[1.5px] border-ink px-4 text-sm font-semibold disabled:opacity-40"
        >
          Fill the form
        </button>
        {note && (
          <p role="status" className="mt-2 text-sm text-muted">
            {note}
          </p>
        )}
      </section>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5">
        <Field id="name" label="Squad name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="amount" label="Each person pays">
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
          <Field id="size" label="People">
            <input id="size" type="number" min={3} max={20} value={size} onChange={(e) => setSize(e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field id="period" label="How often">
          <select id="period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={INPUT}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        {period === "Weekly" && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Due day</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ d, label }) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={weekday === d}
                  onClick={() => setWeekday(d)}
                  className={pill(weekday === d)}
                >
                  {label}
                </button>
              ))}
            </div>
            <HourSelect id="weekly-hour" value={weeklyHour} onChange={setWeeklyHour} />
          </fieldset>
        )}
        {period === "Monthly" && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Due day</legend>
            <div className="grid grid-cols-2 gap-3">
              <select aria-label="Day of the month" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} className={INPUT}>
                {MONTH_DAYS.map((d) => (
                  <option key={d} value={d}>
                    Day {d}
                  </option>
                ))}
              </select>
              <HourSelect id="monthly-hour" value={monthlyHour} onChange={setMonthlyHour} />
            </div>
          </fieldset>
        )}

        {isLive && (
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold">Who can join?</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { on: false, label: "Private", note: "Link and code" },
                { on: true, label: "Public", note: "Anyone can find it" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={isPublic === o.on}
                  onClick={() => setIsPublic(o.on)}
                  className={`min-h-14 rounded-lg border-[1.5px] px-3 text-left ${isPublic === o.on ? "border-ink bg-ink text-manila" : "border-rule"}`}
                >
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className={`block text-xs ${isPublic === o.on ? "text-manila/80" : "text-muted"}`}>{o.note}</span>
                </button>
              ))}
            </div>
            {isPublic && (
              <>
                <Field id="description" label="One line about it">
                  <input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={80}
                    placeholder="Final-year savers, paying every Friday"
                    className={`${INPUT} placeholder:text-muted/80`}
                  />
                </Field>
                <Field id="min-tier" label="Minimum tier">
                  <select id="min-tier" value={minTier} onChange={(e) => setMinTier(Number(e.target.value))} className={INPUT}>
                    {MIN_TIER_LABEL.map((label, i) => (
                      <option key={label} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {period === "Demo" && <p className="text-sm text-muted">Quick demo squads don&apos;t build trust, so everyone starts New.</p>}
                <label className="flex min-h-12 items-center justify-between gap-3 text-sm font-semibold">
                  Approve each person
                  <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="size-5 accent-ink" />
                </label>
              </>
            )}
          </fieldset>
        )}

        {each > 0 && n >= 3 && (
          <p className="text-sm text-muted">
            Each payout is <span className="font-money font-bold text-ink">{naira(each * n)}</span>. The squad runs {n} rounds,
            one payout per person.
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
            {busy ? "Creating…" : "Create squad"}
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
  return (
    <select id={id} aria-label="Time" value={value} onChange={(e) => onChange(Number(e.target.value))} className={INPUT}>
      {HOURS.map(({ h, label }) => (
        <option key={h} value={h}>
          {label}
        </option>
      ))}
    </select>
  );
}
