"use client";

import { useState } from "react";
import { AmountField, Column, Money, Receipt, Submit, toAmount } from "@/components/money-out";
import { ErrorNote, GHOST_BTN, PALM_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { amountProblem, BANKS, maskAccount, validAccountNumber } from "@/lib/money-out";
import { useActions, useMe } from "@/lib/data";
import { rich, useT } from "@/lib/i18n";

// The account number lives only in this component's state: never stored, never sent anywhere.
export default function Withdraw() {
  const me = useMe();
  const { withdraw } = useActions();
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("5000");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const out = useRun("payment");
  const t = useT();
  const value = toAmount(amount);
  const to = `${bank} ${maskAccount(account)}`;

  if (step === "done")
    return (
      <Receipt
        title={rich(t("withdrawnTitle", { to }), { amount: <Money n={value} /> })}
        lines={[t("testMode")]}
      />
    );

  if (step === "confirm")
    return (
      <Column title={t("withdraw")}>
        <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
          {rich(t("withdrawConfirm", { to }), { amount: <Money n={value} /> })}
        </p>
        <p className="mt-2 text-sm text-muted">{t("testNote")} {t("stillLeaves")}</p>
        <div className="mt-auto grid gap-3 pt-8">
          <ErrorNote error={out.error} />
          <button type="button" disabled={out.busy} onClick={() => out.run(async () => (await withdraw(value), setStep("done")))} className={PALM_BTN}>
            {out.busy ? t("withdrawing") : t("withdrawAmount", { amount: naira(value) })}
          </button>
          <button type="button" disabled={out.busy} onClick={() => setStep("form")} className={GHOST_BTN}>
            {t("change")}
          </button>
        </div>
      </Column>
    );

  const accountOk = validAccountNumber(account);
  return (
    <Column title={t("withdraw")}>
      <form onSubmit={(e) => (e.preventDefault(), bank && accountOk && me && !amountProblem(value, me.balance) && setStep("confirm"))} className="flex flex-1 flex-col">
        <p className="mt-3 rounded-md border border-rule bg-paper px-4 py-3 text-sm">{t("testNote")}</p>

        <label htmlFor="bank" className="mt-8 block text-sm font-semibold">
          {t("bank")}
        </label>
        <select
          id="bank"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-md border-[1.5px] border-muted bg-paper px-3 font-semibold focus:border-stamp focus:outline-none"
        >
          <option value="" disabled>
            {t("pickBank")}
          </option>
          {BANKS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>

        <label htmlFor="acct" className="mt-6 block text-sm font-semibold">
          {t("accountNumber")}
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
          {t("tenDigits")}
        </p>

        <AmountField amount={amount} setAmount={setAmount} me={me} />
        <Submit me={me} amount={value} ready={!!bank && accountOk} label={t("withdrawAmount", { amount: naira(value || 0) })} next="/withdraw" />
      </form>
    </Column>
  );
}
