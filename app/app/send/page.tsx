"use client";

import { useState } from "react";
import { AmountField, Column, Money, Receipt, Submit, toAmount } from "@/components/money-out";
import { ErrorNote, GHOST_BTN, PALM_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { normUsername } from "@/lib/money-out";
import { useMyAccount } from "@/lib/live/account";
import { useActions, useMe, type Person } from "@/lib/data";

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
  const value = toAmount(amount);

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    setFindError(null);
    setPerson(null);
    const u = normUsername(username);
    if (!u) return setFindError("Usernames are 3 to 20 letters, numbers or _.");
    await find.run(async () => {
      const p = await findPerson(u);
      if (!p) setFindError(`Nobody has the username @${u}.`);
      else if (myId && p.address.toLowerCase() === myId.toLowerCase()) setFindError("That's you. Pick someone else.");
      else setPerson(p);
    });
  }

  if (step === "done" && person)
    return (
      <Receipt
        title={
          <>
            Sent <Money n={value} /> to {person.displayName}
          </>
        }
        lines={[`@${person.username}`]}
      />
    );

  if (step === "confirm" && person)
    return (
      <Column title="Send money">
        <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
          Send <Money n={value} /> to {person.displayName} (@{person.username})?
        </p>
        <p className="mt-2 text-sm text-muted">It lands in their balance right away. It can&apos;t be undone.</p>
        <div className="mt-auto grid gap-3 pt-8">
          <ErrorNote error={pay.error} />
          <button type="button" disabled={pay.busy} onClick={() => pay.run(async () => (await send(person.address, value), setStep("done")))} className={PALM_BTN}>
            {pay.busy ? "Sending…" : `Send ${naira(value)}`}
          </button>
          <button type="button" disabled={pay.busy} onClick={() => setStep("form")} className={GHOST_BTN}>
            Change
          </button>
        </div>
      </Column>
    );

  return (
    <Column title="Send money">
      <form onSubmit={lookUp} className="mt-8">
        <label htmlFor="username" className="block text-sm font-semibold">
          Send to
        </label>
        <div className="mt-2 flex gap-2">
          <div className="flex min-h-14 flex-1 items-center rounded-md border-[1.5px] border-muted bg-paper px-3 focus-within:border-stamp">
            <span className="font-mono text-muted">@</span>
            <input
              id="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="username"
              value={username}
              onChange={(e) => (setUsername(e.target.value), setPerson(null))}
              className="w-full bg-transparent pl-1 font-mono outline-none"
            />
          </div>
          <button type="submit" disabled={find.busy || !username.trim()} className="flex min-h-14 items-center rounded-lg bg-ink px-5 font-semibold text-manila active:scale-[0.98] disabled:opacity-70">
            {find.busy ? "Finding…" : "Find"}
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

      <form onSubmit={(e) => (e.preventDefault(), setStep("confirm"))} className="flex flex-1 flex-col">
        <AmountField amount={amount} setAmount={setAmount} me={me} />
        <Submit me={me} amount={value} ready={!!person} label={person ? `Send ${naira(value || 0)} to ${person.displayName}` : "Find someone first"} next="/send" />
      </form>
    </Column>
  );
}
