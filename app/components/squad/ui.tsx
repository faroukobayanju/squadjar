"use client";

// Shared bits for the squad state views: button looks, the run-an-action hook, and a confirm sheet.
import { useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { friendlyError } from "@/lib/errors";
import { naira } from "@/lib/format";
import { DemoError, type Squad } from "@/lib/data";

const PRESS = "flex w-full items-center justify-center rounded-lg active:scale-[0.98] disabled:opacity-70";
export const INK_BTN = `${PRESS} min-h-14 bg-ink font-semibold text-manila`;
export const PALM_BTN = `${PRESS} min-h-14 bg-palm font-money text-[1.25rem] font-bold text-on-palm transition-transform duration-75 active:bg-palm-press`;
export const GHOST_BTN = `${PRESS} min-h-13 border-[1.5px] border-ink font-semibold`;
export const PAID_LABEL = "flex min-h-14 items-center justify-center gap-3 rounded-lg border border-rule px-4 text-center font-semibold text-muted";

/** "You need ₦X more" with an Add money link back to `next`; shown instead of a payment button when the balance is short. */
export function AddMoneyNote({ short, balance, next }: { short: number; balance: number; next: string }) {
  const up = Math.ceil(short / 100) * 100;
  return (
    <>
      <p className="mb-3 text-sm">
        You need {naira(short)} more. Your balance is {naira(balance)}.
      </p>
      <Link href={`/add-money?amount=${up}&next=${next}`} className={INK_BTN}>
        Add {naira(up)}
      </Link>
    </>
  );
}

/** Runs one action at a time; `error` is user-facing copy, and the same button is the Retry. */
export function useRun(kind: "payment" | "other") {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof DemoError ? e.message : friendlyError(e, kind));
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
      {error}
    </p>
  );
}

/** A button that asks first, in a native modal <dialog> (focus trap and Esc for free). */
export function ConfirmButton({
  label,
  busyLabel,
  body,
  busy,
  className,
  onConfirm,
}: {
  label: string;
  busyLabel: string;
  body: string;
  busy: boolean;
  className: string;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={() => ref.current?.showModal()} className={className}>
        {busy ? busyLabel : label}
      </button>
      <dialog
        ref={ref}
        aria-label={label}
        className="m-auto w-[calc(100%-2rem)] max-w-[448px] rounded-lg border border-rule bg-paper p-5 text-ink backdrop:bg-ink/40"
      >
        <p className="font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">{label}?</p>
        <p className="mt-2 max-w-[38ch] text-muted">{body}</p>
        <form method="dialog" className="mt-6 grid gap-3">
          <button value="ok" onClick={onConfirm} className={INK_BTN}>
            {label}
          </button>
          <button value="cancel" className={GHOST_BTN}>
            Not now
          </button>
        </form>
      </dialog>
    </>
  );
}

export function SquadTitle({ squad, meta }: { squad: Squad; meta: string }) {
  return (
    <header>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {meta} · <span className="font-money text-[13px] font-bold text-ink">{naira(squad.contribution)}</span> each · {squad.period}
      </p>
    </header>
  );
}

/** A whole-screen message: not found, cancelled, already started. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-balance">{title}</h1>
      <p className="mt-2 max-w-[38ch] text-muted">{body}</p>
      <Link href="/home" className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
        Go to your squads
      </Link>
    </AppShell>
  );
}

/** How long members get to lock deposits after start (Squad.depositWindow per period). */
export const DEPOSIT_WINDOW: Record<Squad["period"], string> = { Demo: "5 minutes", Weekly: "2 days", Monthly: "3 days" };
