"use client";

// Shared by /send and /withdraw: the page column, the ₦ amount field with quick chips, and the receipt.
import Link from "next/link";
import { BackLink, useRequireLogin } from "@/components/shell";
import { Bar } from "@/components/skeleton";
import { AddMoneyNote, INK_BTN, PALM_BTN } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { amountProblem, MIN_OUT } from "@/lib/money-out";
import type { Me } from "@/lib/data";
import { rich, useT } from "@/lib/i18n";

const QUICK = [2000, 5000, 10000, 20000];

/** An amount inside copy: money font, tabular figures. */
export const Money = ({ n }: { n: number }) => <span className="font-money tnum">{naira(n)}</span>;

export const toAmount = (s: string) => Number(s.replace(/\D/g, ""));

export function Column({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  if (useRequireLogin()) return null;
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href="/home" label={t("home")} />
      <h1 className="mt-2 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{title}</h1>
      {children}
    </div>
  );
}

export function AmountField({ amount, setAmount, me }: { amount: string; setAmount: (s: string) => void; me: Me | undefined }) {
  const value = toAmount(amount);
  const t = useT();
  return (
    <>
      <label htmlFor="amount" className="mt-8 block text-sm font-semibold">
        {t("amount")}
      </label>
      <div className="mt-2 flex min-h-16 items-center rounded-md border-[1.5px] border-muted bg-paper px-4 focus-within:border-stamp">
        <span className="font-money text-3xl font-bold tnum">₦</span>
        <input
          id="amount"
          inputMode="numeric"
          autoComplete="off"
          value={value ? value.toLocaleString("en-NG") : ""}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent pl-1 font-money text-3xl font-bold tnum outline-none"
          aria-describedby="amount-help"
        />
      </div>
      <p id="amount-help" className="mt-2 text-xs text-muted">
        {t("outMin", { amount: naira(MIN_OUT) })}{" "}
        {me ? (
          rich(t("outHave"), { amount: <span className="font-money font-bold text-ink tnum">{naira(me.balance)}</span> })
        ) : (
          <Bar className="inline-block h-3 w-20 align-middle" />
        )}
      </p>
      <QuickChips value={value} setAmount={setAmount} />
    </>
  );
}

/** One row of four equal ₦ quick-picks; fits a 360px phone. Shared with Add money. */
export function QuickChips({ value, setAmount }: { value: number; setAmount: (s: string) => void }) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {QUICK.map((q) => (
        <button
          key={q}
          type="button"
          aria-pressed={value === q}
          onClick={() => setAmount(String(q))}
          className={`min-h-11 rounded-full border-[1.5px] px-1 font-money text-[15px] font-bold whitespace-nowrap tnum ${value === q ? "border-ink bg-ink text-manila" : "border-rule"}`}
        >
          {naira(q)}
        </button>
      ))}
    </div>
  );
}

/** The bottom of the form: Add money when the balance is short, else the palm button (disabled until `ready`). */
export function Submit({ me, amount, ready, label, next }: { me: Me | undefined; amount: number; ready: boolean; label: string; next: string }) {
  const problem = me ? amountProblem(amount, me.balance) : "min";
  return (
    <div className="mt-auto pt-8">
      {me && problem === "short" ? (
        <AddMoneyNote short={amount - me.balance} balance={me.balance} next={next} />
      ) : (
        <button type="submit" disabled={!ready || !!problem} className={PALM_BTN}>
          {label}
        </button>
      )}
    </div>
  );
}

export function Receipt({ title, lines }: { title: React.ReactNode; lines: string[] }) {
  const t = useT();
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="mt-8 font-display text-[clamp(2.2rem,10vw,2.8rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">{title}</h1>
      {lines.map((l) => (
        <p key={l} className="mt-3 font-mono text-xs text-muted">
          {l}
        </p>
      ))}
      <div className="mt-auto pt-10">
        <Link href="/home" className={INK_BTN}>
          {t("done")}
        </Link>
      </div>
    </div>
  );
}
