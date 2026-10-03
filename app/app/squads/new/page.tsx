"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react";
import { BackLink } from "@/components/shell";
import { parseDraft } from "@/lib/draft";
import { naira } from "@/lib/format";
import { DemoError, useActions, type Period } from "@/lib/data";

const PERIODS: { value: Period; label: string }[] = [
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Demo", label: "Quick demo (5-minute rounds)" },
];

export default function NewSquad() {
  const router = useRouter();
  const { createSquad } = useActions();
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("5000");
  const [size, setSize] = useState("8");
  const [period, setPeriod] = useState<Period>("Weekly");
  const [error, setError] = useState<string | null>(null);

  function fill() {
    const d = parseDraft(ask);
    if (d.name) setName(d.name);
    if (d.contribution) setAmount(String(d.contribution));
    if (d.size) setSize(String(d.size));
    if (d.period) setPeriod(d.period);
    const missing = [!d.contribution && "how much each person pays", !d.size && "how many of you", !d.period && "weekly or monthly"].filter(Boolean);
    setNote(missing.length ? `Filled what I could. Still need: ${missing.join(", ")}.` : "Filled in below. Check it, then create.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const slug = await createSquad({ name, contribution: Number(amount.replace(/\D/g, "")), size: Number(size), period });
      router.push(`/s/${slug}`);
    } catch (err) {
      setError(err instanceof DemoError ? err.message : "Couldn't create the squad. Try again.");
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
          <button type="submit" className="flex min-h-14 w-full items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]">
            Create squad
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
