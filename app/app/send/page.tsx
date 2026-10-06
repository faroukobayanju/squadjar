"use client";

import { useState } from "react";
import { AmountField, Column, Money, Receipt, Submit, toAmount } from "@/components/money-out";
import { ErrorNote, GHOST_BTN, PALM_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { amountProblem, normUsername } from "@/lib/money-out";
import { useMyAccount } from "@/lib/live/account";
import { useActions, useMe, type Person } from "@/lib/data";
import { rich, useT } from "@/lib/i18n";

export default function Send() {
  const me = useMe();
  const { address: myId } = useMyAccount();
  const { findPerson, send } = useActions();
  const [username, setUsername] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [amount, setAmount] = useState("5000");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [findError, setFindError] = useState<string | null>(null);
  const find = useRun("other");
  const pay = useRun("payment");
  const t = useT();
  const value = toAmount(amount);

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    setFindError(null);
    setPerson(null);
    const u = normUsername(username);
    if (!u) return setFindError(t("usernameRule"));
    await find.run(async () => {
      const p = await findPerson(u);
      if (!p) setFindError(t("noSuchUser", { username: u }));
      else if (myId && p.address.toLowerCase() === myId.toLowerCase()) setFindError(t("thatsYou"));
      else setPerson(p);
    });
  }

  if (step === "done" && person)
    return (
      <Receipt
        title={rich(t("sentTitle", { name: person.displayName }), { amount: <Money n={value} /> })}
        lines={[`@${person.username}`]}
      />
    );

  if (step === "confirm" && person)
    return (
      <Column title={t("sendMoney")}>
        <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
          {rich(t("sendConfirm", { name: person.displayName, username: person.username }), { amount: <Money n={value} /> })}
        </p>
        <p className="mt-2 text-sm text-muted">{t("sendNote")}</p>
        <div className="mt-auto grid gap-3 pt-8">
          <ErrorNote error={pay.error} />
          <button type="button" disabled={pay.busy} onClick={() => pay.run(async () => (await send(person.address, value), setStep("done")))} className={PALM_BTN}>
            {pay.busy ? t("sending") : t("sendAmount", { amount: naira(value) })}
          </button>
          <button type="button" disabled={pay.busy} onClick={() => setStep("form")} className={GHOST_BTN}>
            {t("change")}
          </button>
        </div>
      </Column>
    );

  return (
    <Column title={t("sendMoney")}>
      <form onSubmit={lookUp} className="mt-8">
        <label htmlFor="username" className="block text-sm font-semibold">
          {t("sendTo")}
        </label>
        <div className="mt-2 flex gap-2">
          <div className="flex min-h-14 flex-1 items-center rounded-md border-[1.5px] border-muted bg-paper px-3 focus-within:border-stamp">
            <span className="font-mono text-muted">@</span>
            <input
              id="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("usernamePlaceholder")}
              value={username}
              onChange={(e) => (setUsername(e.target.value), setPerson(null))}
              className="w-full bg-transparent pl-1 font-mono outline-none"
            />
          </div>
          <button type="submit" disabled={find.busy || !username.trim()} className="flex min-h-14 items-center rounded-lg bg-ink px-5 font-semibold text-manila active:scale-[0.98] disabled:opacity-70">
            {find.busy ? t("finding") : t("find")}
          </button>
        </div>
        <div className="mt-3">
          <ErrorNote error={findError ?? find.error} />
        </div>
        {person && (
          <p className="rounded-md border border-rule bg-paper px-4 py-3">
            <span className="font-semibold">{person.displayName}</span> <span className="font-mono text-sm text-muted">@{person.username}</span>
          </p>
        )}
      </form>

      <form onSubmit={(e) => (e.preventDefault(), person && me && !amountProblem(value, me.balance) && setStep("confirm"))} className="flex flex-1 flex-col">
        <AmountField amount={amount} setAmount={setAmount} me={me} />
        <Submit me={me} amount={value} ready={!!person} label={person ? t("sendToName", { amount: naira(value || 0), name: person.displayName }) : t("findFirst")} next="/send" />
      </form>
    </Column>
  );
}
