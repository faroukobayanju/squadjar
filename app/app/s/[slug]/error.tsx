"use client";

// Shown when the squad can't be loaded (live polls throw after 3 failures in a row with nothing to show).
import { AppShell } from "@/components/shell";
import { INK_BTN } from "@/components/squad/ui";

export default function SquadError({ retry }: { error: Error; retry: () => void }) {
  return (
    <AppShell action={<button type="button" onClick={() => retry()} className={INK_BTN}>Retry</button>}>
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">We couldn&apos;t load this squad.</h1>
      <p className="mt-2 max-w-[38ch] text-muted">Check your connection, then try again. Your money is safe.</p>
    </AppShell>
  );
}
