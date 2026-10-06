"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLoginWithEmail, useLoginWithOAuth } from "@privy-io/react-auth";
import { GoogleLogo } from "@phosphor-icons/react";
import { BackLink } from "@/components/shell";
import { useMyAccount } from "@/lib/live/account";
import { safeNext } from "@/lib/next";
import { hasPrivy } from "@/lib/live/chain";
import { useT } from "@/lib/i18n";

export default function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = use(searchParams);
  const next = safeNext(sp.next);
  return hasPrivy ? <PrivyLogin next={next} /> : <DemoLogin next={next} />;
}

// Hooks live in separate components: Privy hooks only work inside PrivyProvider.
function PrivyLogin({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const { ready, authenticated, address } = useMyAccount();
  const onError = (e: unknown) => console.error("[login]", e);
  const { sendCode, loginWithCode } = useLoginWithEmail({ onError });
  const { initOAuth, state: oauthState } = useLoginWithOAuth({ onError });
  // Signed in (or returning from Google) but the account isn't ready yet: say so instead of showing a dead form.
  const settingUp = (ready && authenticated) || oauthState.status === "loading";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    // New users pick a display name first. A 503 (no database) or any failure skips it.
    fetch(`/api/names?a=${address.toLowerCase()}`)
      .then((r) => (r.ok ? r.json() : { [address.toLowerCase()]: true }))
      .catch(() => ({ [address.toLowerCase()]: true }))
      .then((names) => router.replace(names[address.toLowerCase()] ? next : `/welcome?next=${encodeURIComponent(next)}`));
  }, [ready, authenticated, address, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t("loginBadEmail"));
    if (sent && !/^\d{6}$/.test(code)) return setError(t("loginBadCode"));
    setBusy(true);
    try {
      if (sent) await loginWithCode({ code });
      else {
        await sendCode({ email });
        setSent(true);
      }
    } catch (err) {
      console.error("[login]", err);
      setError(sent ? t("loginBadCode") : t("loginSendFail"));
    }
    setBusy(false);
  }

  async function resend() {
    setError(null);
    setCode("");
    try {
      await sendCode({ email });
    } catch {
      setError(t("loginSendFail"));
    }
  }

  if (settingUp)
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-2 pb-8" aria-live="polite">
        <BackLink href="/" label="Squadjar" />
        <h1 className="mt-8 font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.04em]">{t("loginIn")}</h1>
        <p className="mt-3 text-muted">{t("loginSettingUp")}</p>
      </div>
    );

  return (
    <LoginView
      email={email}
      onEmail={(v) => {
        setEmail(v);
        setError(null);
      }}
      onBack={() => {
        setSent(false);
        setCode("");
        setError(null);
      }}
      onResend={resend}
      code={sent ? code : undefined}
      onCode={(v) => {
        setCode(v.replace(/\D/g, "").slice(0, 6));
        setError(null);
      }}
      error={error}
      busy={busy}
      onSubmit={submit}
      onGoogle={() => initOAuth({ provider: "google" }).catch((err) => (console.error("[login google]", err), setError(t("loginGoogleFail"))))}
    />
  );
}

function DemoLogin({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("loginBadEmail"));
      return;
    }
    router.push(next);
  }

  return (
    <LoginView
      email={email}
      onEmail={(v) => {
        setEmail(v);
        setError(null);
      }}
      error={error}
      onSubmit={submit}
      onGoogle={() => router.push(next)}
    />
  );
}

type ViewProps = {
  email: string;
  onEmail(v: string): void;
  code?: string;
  onCode?(v: string): void;
  onBack?(): void;
  onResend?(): void;
  error: string | null;
  busy?: boolean;
  onSubmit(e: React.FormEvent): void;
  onGoogle(): void;
};

function LoginView({ email, onEmail, code, onCode, onBack, onResend, error, busy, onSubmit, onGoogle }: ViewProps) {
  const asking = code !== undefined;
  const t = useT();
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-2 pb-8">
      <BackLink href="/" label="Squadjar" />
      <h1 className="mt-8 font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.04em]">{t("loginTitle")}</h1>
      <p className="mt-3 text-muted">{t("loginLead")}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-2">
        <label htmlFor="email" className="text-sm font-semibold">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          readOnly={asking}
          onChange={(e) => onEmail(e.target.value)}
          aria-invalid={!!error && !asking}
          aria-describedby={error ? "login-error" : undefined}
          className="min-h-[52px] rounded-md border-[1.5px] border-muted/60 bg-paper px-3 outline-none focus:border-stamp"
        />
        {asking && (
          <>
            <p className="text-sm text-muted">{t("loginSent", { email })}</p>
            <label htmlFor="code" className="mt-2 text-sm font-semibold">
              {t("loginCode")}
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => onCode?.(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              className="min-h-[52px] rounded-md border-[1.5px] border-muted/60 bg-paper px-3 font-mono tnum outline-none focus:border-stamp"
            />
          </>
        )}
        {error && (
          <p id="login-error" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-3 flex min-h-14 items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98] disabled:opacity-60">
          {asking ? t("logIn") : t("loginSendCode")}
        </button>
        {asking && (
          <div className="mt-1 flex justify-between text-sm font-semibold">
            <button type="button" onClick={onBack} className="min-h-11 underline underline-offset-4">
              {t("loginOtherEmail")}
            </button>
            <button type="button" onClick={onResend} className="min-h-11 underline underline-offset-4">
              {t("loginResend")}
            </button>
          </div>
        )}
      </form>

      <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-rule" />
        {t("or")}
        <span className="h-px flex-1 bg-rule" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-[1.5px] border-ink font-semibold active:scale-[0.98]"
      >
        <GoogleLogo size={20} weight="bold" aria-hidden />
        {t("loginGoogle")}
      </button>
    </div>
  );
}
