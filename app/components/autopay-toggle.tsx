"use client";

import { useEffect, useState } from "react";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { ErrorNote, GHOST_BTN, INK_BTN, useRun } from "@/components/squad/ui";
import { naira } from "@/lib/format";
import { isLive, type Squad } from "@/lib/data";
import { useMyAccount } from "@/lib/live/account";
import { rich, useT } from "@/lib/i18n";

const SIGNER = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
const POLICY = process.env.NEXT_PUBLIC_PRIVY_AUTOPAY_POLICY_ID;

/** Hook-free gate: demo mode, unset signer env and demo squads render nothing, so Privy hooks only run when live. */
export function AutopayToggle({ squad }: { squad: Squad }) {
  if (!isLive || !SIGNER || !POLICY || !squad.address) return null;
  return <Toggle squad={squad} address={squad.address} />;
}

function Toggle({ squad, address }: { squad: Squad; address: string }) {
  const { getAccessToken } = usePrivy();
  const { addSigners } = useSigners();
  const { address: me } = useMyAccount();
  const [state, setState] = useState<{ enabled: boolean; signer: boolean } | null>(null);
  const { run, busy, error } = useRun("other");
  const t = useT();

  const call = async (init?: RequestInit) => {
    const res = await fetch(init ? "/api/autopay" : `/api/autopay?squad=${address}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`autopay ${res.status}`);
    return res.json();
  };

  useEffect(() => {
    call().then(setState, () => setState(null)); // not configured or signed out: show nothing
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per squad
  }, [address]);

  if (!state || !me) return null;

  const set = (enabled: boolean) =>
    run(async () => {
      if (enabled && !state.signer) {
        await addSigners({ address: me, signers: [{ signerId: SIGNER!, policyIds: [POLICY!] }] });
        setState((s) => s && { ...s, signer: true });
      }
      await call({ method: "POST", body: JSON.stringify({ squad: address, enabled }) });
      setState((s) => s && { ...s, enabled });
    });

  return (
    <section aria-labelledby="autopay" className="mt-8 rounded-lg border border-rule bg-paper p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="autopay" className="font-semibold">
          {t("autopay")}
        </h2>
        {state.enabled && state.signer && (
          <span className="inline-flex h-7 items-center rounded-full border-[1.5px] border-stamp bg-stamp/10 px-2.5 font-mono text-xs text-stamp">{t("autopayOn")}</span>
        )}
      </div>
      <p className="mt-1 max-w-[42ch] text-sm text-muted">
        {rich(t("autopayBody", { squad: squad.name }), { amount: <span className="font-money font-bold text-ink">{naira(squad.contribution)}</span> })}
      </p>
      <div className="mt-4">
        <ErrorNote error={error} />
        <button type="button" disabled={busy} onClick={() => set(!(state.enabled && state.signer))} className={state.enabled && state.signer ? GHOST_BTN : INK_BTN}>
          {busy ? t("saving") : state.enabled && state.signer ? t("turnOff") : t("turnOn")}
        </button>
      </div>
    </section>
  );
}

/** Profile: removes Squadjar's signer from the account and turns auto-pay off in every squad. */
export function StopAutopayEverywhere() {
  if (!isLive || !SIGNER || !POLICY) return null;
  return <StopAll />;
}

function StopAll() {
  const { getAccessToken } = usePrivy();
  const { removeSigners } = useSigners();
  const { address: me } = useMyAccount();
  const { run, busy, error } = useRun("other");
  const [done, setDone] = useState(false);
  const t = useT();
  if (!me) return null;
  return (
    <div className="mt-10">
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={busy || done}
        onClick={() =>
          run(async () => {
            const res = await fetch("/api/autopay", {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
              body: JSON.stringify({ all: true, enabled: false }),
            });
            if (!res.ok) throw new Error(`autopay ${res.status}`);
            await removeSigners({ address: me });
            setDone(true);
          })
        }
        className={GHOST_BTN}
      >
        {busy ? t("stopping") : done ? t("autopayOffAll") : t("stopAutopayAll")}
      </button>
    </div>
  );
}
