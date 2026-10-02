"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogo } from "@phosphor-icons/react";
import { BackLink } from "@/components/shell";

// ponytail: demo sign-in only. Privy email/Google login replaces this page in Plan 2.
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That email doesn't look right. Check for typos.");
      return;
    }
    router.push("/home");
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-2 pb-8">
      <BackLink href="/" label="Squadjar" />
      <h1 className="mt-8 font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.04em]">Log in or sign up</h1>
      <p className="mt-3 text-muted">One code to your email. No passwords.</p>

      <form onSubmit={submit} noValidate className="mt-8 grid gap-2">
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : undefined}
          className="min-h-[52px] rounded-md border-[1.5px] border-muted/60 bg-paper px-3 outline-none focus:border-stamp"
        />
        {error && (
          <p id="email-error" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" className="mt-3 flex min-h-14 items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]">
          Send my code
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>

      <button
        type="button"
        onClick={() => router.push("/home")}
        className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-[1.5px] border-ink font-semibold active:scale-[0.98]"
      >
        <GoogleLogo size={20} weight="bold" aria-hidden />
        Continue with Google
      </button>
    </div>
  );
}
