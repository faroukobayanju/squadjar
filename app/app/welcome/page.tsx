"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { safeNext } from "@/lib/next";
import { hasPrivy } from "@/lib/live/chain";
import { LanguagePicker } from "@/components/language-picker";
import { useLang, useT } from "@/lib/i18n";

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
  const t = useT();
  const language = useLang();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    if (!displayName) return setError(t("welcomeNameMissing"));
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return setError(t("usernameRule"));
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ displayName, username: handle, language }) });
      if (r.status === 409) {
        setError(t("welcomeTaken", { handle }));
        setBusy(false);
        return;
      }
      if (!r.ok) throw new Error();
      let seen = false;
      try {
        seen = !!localStorage.getItem("squadjar-intro-seen");
      } catch {}
      router.replace(seen ? next : `/intro?next=${encodeURIComponent(next)}`);
    } catch {
      setError(t("errGeneric"));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-14 pb-8">
      <h1 className="font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.04em]">{t("welcomeTitle")}</h1>
      <p className="mt-3 text-muted">{t("welcomeLead")}</p>
      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold">{t("language")}</p>
        <LanguagePicker />
      </div>
      <form onSubmit={submit} noValidate className="mt-8 grid gap-2">
        <label htmlFor="name" className="text-sm font-semibold">
          {t("displayName")}
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
        <label htmlFor="username" className="mt-4 text-sm font-semibold">
          {t("username")}
        </label>
        <div className="flex min-h-[52px] items-center rounded-md border-[1.5px] border-muted/60 bg-paper px-3 focus-within:border-stamp">
          <span className="text-muted" aria-hidden>
            @
          </span>
          <input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={21}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""));
              setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby="username-hint"
            className="min-w-0 flex-1 bg-transparent pl-0.5 outline-none"
          />
        </div>
        <p id="username-hint" className="text-sm text-muted">
          {t("usernameHint")}
        </p>
        {error && (
          <p id="welcome-error" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-3 flex min-h-14 items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98] disabled:opacity-60">
          {t("continue")}
        </button>
      </form>
    </div>
  );
}
