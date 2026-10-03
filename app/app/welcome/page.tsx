"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { safeNext } from "@/lib/next";
import { hasPrivy } from "@/lib/live/chain";

export default function Welcome({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = use(searchParams);
  const next = safeNext(sp.next);
  return hasPrivy ? <PrivyWelcome next={next} /> : <Redirect next={next} />;
}

function Redirect({ next }: { next: string }) {
  const router = useRouter();
  useEffect(() => router.replace(next), [next, router]);
  return null;
}

function PrivyWelcome({ next }: { next: string }) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    if (!displayName) return setError("Enter a name your squad will see.");
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ displayName }) });
      if (!r.ok) throw new Error();
      router.replace(next);
    } catch {
      setError("That didn't go through. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-14 pb-8">
      <h1 className="font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.04em]">What should your squad call you?</h1>
      <p className="mt-3 text-muted">Your Squad sees this name next to your Contributions.</p>
      <form onSubmit={submit} noValidate className="mt-8 grid gap-2">
        <label htmlFor="name" className="text-sm font-semibold">
          Your name
        </label>
        <input
          id="name"
          autoComplete="given-name"
          autoFocus
          maxLength={30}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "welcome-error" : undefined}
          className="min-h-[52px] rounded-md border-[1.5px] border-muted/60 bg-paper px-3 outline-none focus:border-stamp"
        />
        {error && (
          <p id="welcome-error" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-3 flex min-h-14 items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98] disabled:opacity-60">
          Continue
        </button>
      </form>
    </div>
  );
}
