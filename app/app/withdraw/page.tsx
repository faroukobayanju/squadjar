"use client";

import { useState } from "react";
import { AmountField, Column, Money, Receipt, Submit, toAmount } from "@/components/money-out";
import { ErrorNote, GHOST_BTN, PALM_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { BANKS, maskAccount, validAccountNumber } from "@/lib/money-out";
import { useActions, useMe } from "@/lib/data";

const TEST_NOTE = "Test mode: no real money is sent to your bank.";

// The account number lives only in this component's state: never stored, never sent anywhere.
export default function Withdraw() {
  const me = useMe();
  const { withdraw } = useActions();
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("5000");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const out = useRun("payment");
  const value = toAmount(amount);
  const to = `${bank} ${maskAccount(account)}`;

  if (step === "done")
    return (
      <Receipt
        title={
          <>
            <Money n={value} /> sent to {to}
          </>
        }
        lines={["Test mode"]}
      />
    );

  if (step === "confirm")
    return (
      <Column title="Withdraw">
        <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
          Send <Money n={value} /> to {to}?
        </p>
        <p className="mt-2 text-sm text-muted">{TEST_NOTE} The money still leaves your balance.</p>
        <div className="mt-auto grid gap-3 pt-8">
          <ErrorNote error={out.error} />
          <button type="button" disabled={out.busy} onClick={() => out.run(async () => (await withdraw(value), setStep("done")))} className={PALM_BTN}>
            {out.busy ? "Withdrawing…" : `Withdraw ${naira(value)}`}
          </button>
          <button type="button" disabled={out.busy} onClick={() => setStep("form")} className={GHOST_BTN}>
            Change
          </button>
        </div>
      </Column>
    );

  const accountOk = validAccountNumber(account);
  return (
    <Column title="Withdraw">
      <form onSubmit={(e) => (e.preventDefault(), setStep("confirm"))} className="flex flex-1 flex-col">
        <p className="mt-3 rounded-md border border-rule bg-paper px-4 py-3 text-sm">{TEST_NOTE}</p>

        <label htmlFor="bank" className="mt-8 block text-sm font-semibold">
          Bank
        </label>
        <select
          id="bank"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-md border-[1.5px] border-muted bg-paper px-3 font-semibold focus:border-stamp focus:outline-none"
        >
          <option value="" disabled>
            Pick your bank
          </option>
          {BANKS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>

        <label htmlFor="acct" className="mt-6 block text-sm font-semibold">
          Account number
        </label>
        <input
          id="acct"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={account}
          onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 10))}
          aria-describedby="acct-help"
          aria-invalid={account.length > 0 && !accountOk}
          className="mt-2 min-h-14 w-full rounded-md border-[1.5px] border-muted bg-paper px-3 font-mono text-lg tnum tracking-[0.08em] focus:border-stamp focus:outline-none"
        />
        <p id="acct-help" className="mt-2 text-xs text-muted">
          10 digits.
        </p>

        <AmountField amount={amount} setAmount={setAmount} me={me} />
        <Submit me={me} amount={value} ready={!!bank && accountOk} label={`Withdraw ${naira(value || 0)}`} next="/withdraw" />
      </form>
    </Column>
  );
}
