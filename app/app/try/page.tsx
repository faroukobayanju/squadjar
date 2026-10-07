"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { INK_BTN } from "@/components/squad/ui";
import { useT } from "@/lib/i18n";

// Judges' entry: the current demo squad (two bot members, one free seat) via /api/judge, then its invite link.
export default function Try() {
  const router = useRouter();
  const t = useT();
  const [waiting, setWaiting] = useState(false);

  const go = useCallback(async () => {
    setWaiting(false);
    const s = await fetch("/api/judge")
      .then((r) => (r.ok ? (r.json() as Promise<{ slug: string; code: string }>) : null))
      .catch(() => null);
    if (s) router.replace(`/s/${s.slug}?code=${s.code}`);
    else setWaiting(true);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch on load; setState happens after it resolves
    go();
  }, [go]);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-4 pb-8">
      <div className="flex h-12 items-center">
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">Squadjar</span>
      </div>
      {waiting ? (
        <main className="mt-10">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-balance">{t("tryReadyTitle")}</h1>
          <p className="mt-2 max-w-[38ch] text-muted">{t("tryReadyBody")}</p>
          <button type="button" onClick={go} className={`mt-6 ${INK_BTN}`}>
            {t("retry")}
          </button>
        </main>
      ) : (
        <p aria-busy="true" className="mt-10 text-muted">
          {t("loading")}
        </p>
      )}
    </div>
  );
}
