"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits } from "viem";
import { BackLink } from "@/components/shell";
import { naira } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { useMyAccount } from "@/lib/live/account";
import { isLive, publicClient, TOKEN } from "@/lib/live/chain";
import { tokenAbi } from "@/lib/live/abi";
import { useWrite } from "@/lib/live/tx";
import { DemoError, addMoney, useStore } from "@/lib/store";

const QUICK = [2000, 5000, 10000, 20000];

export default function AddMoney({ searchParams }: { searchParams: Promise<{ amount?: string; next?: string }> }) {
  const sp = use(searchParams);
  const router = useRouter();
  const demoBalance = useStore((s) => s.balance);
  const { address } = useMyAccount();
  const { write } = useWrite();
  const [liveBalance, setLiveBalance] = useState<number>();
  const balance = isLive ? (liveBalance ?? 0) : demoBalance;

  // isLive is a build-time constant, so the effect is either always or never registered.
  useEffect(() => {
    if (!isLive || !address) return;
    const read = () =>
      publicClient
        .readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [address] })
        .then((b) => setLiveBalance(Number(formatUnits(b, 18))), () => {});
    read();
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, [address]);
  const [amount, setAmount] = useState(sp.amount ?? "5000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = sp.next?.startsWith("/") ? sp.next : "/home";
  const value = Number(amount.replace(/\D/g, ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isLive) {
        await write({ address: TOKEN, abi: tokenAbi, functionName: "faucet", args: [parseUnits(String(value), 18)] });
      } else {
        await new Promise((ok) => setTimeout(ok, 700));
        addMoney(value);
      }
      router.push(next);
    } catch (err) {
      setError(
        err instanceof DemoError
          ? err.message
          : isLive
            ? friendlyError(err, "other")
            : "That didn't go through. Nothing was charged. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackLink href={next} label="Back" />
      <form onSubmit={submit} className="mt-2 flex flex-1 flex-col">
        <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">Add money</h1>
        <p className="mt-2 text-sm text-muted">Balance now {naira(balance)}</p>

        <label htmlFor="amount" className="mt-8 block text-sm font-semibold">
          Amount
        </label>
        <div className="mt-2 flex min-h-16 items-center rounded-md border-[1.5px] border-muted bg-paper px-4 focus-within:border-stamp">
          <span className="font-money text-3xl font-bold text-muted">₦</span>
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
          ₦100 to ₦200,000 per top-up.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className={`min-h-11 rounded-full border-[1.5px] px-4 font-money font-bold tnum ${value === q ? "border-ink bg-ink text-manila" : "border-rule"}`}
            >
              {naira(q)}
            </button>
          ))}
        </div>

        <fieldset className="mt-8 rounded-lg border border-rule bg-paper p-4">
          <legend className="px-1 text-sm font-semibold">Card</legend>
          <p className="mb-3 text-xs text-muted">Test mode: no real card is charged. Use the number below.</p>
          <label htmlFor="card" className="text-xs font-semibold text-muted">
            Card number
          </label>
          <input
            id="card"
            defaultValue="4242 4242 4242 4242"
            inputMode="numeric"
            autoComplete="off"
            className="mt-1 mb-3 min-h-12 w-full rounded-md border border-rule bg-manila/40 px-3 font-mono tnum"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp" className="text-xs font-semibold text-muted">
                Expiry
              </label>
              <input id="exp" defaultValue="12/28" className="mt-1 min-h-12 w-full rounded-md border border-rule bg-manila/40 px-3 font-mono" />
            </div>
            <div>
              <label htmlFor="cvc" className="text-xs font-semibold text-muted">
                CVC
              </label>
              <input id="cvc" defaultValue="123" className="mt-1 min-h-12 w-full rounded-md border border-rule bg-manila/40 px-3 font-mono" />
            </div>
          </div>
        </fieldset>

        <div className="mt-auto pt-8">
          {error && (
            <p role="alert" className="mb-4 rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !value}
            className="flex min-h-14 w-full items-center justify-center rounded-lg bg-palm font-money text-[1.25rem] font-bold text-on-palm active:scale-[0.98] active:bg-palm-press disabled:opacity-60"
          >
            {busy ? "Adding…" : `Add ${naira(value || 0)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
