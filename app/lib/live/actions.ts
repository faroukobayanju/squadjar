"use client";

// Live writes (sponsored, via useWrite) and the signed-in API calls that go with them.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { encodeAbiParameters, keccak256, maxUint256, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { factoryAbi, squadAbi, tokenAbi } from "./abi";
import { FACTORY, TOKEN, fromUnits, publicClient, toUnits } from "./chain";
import { useMyAccount } from "./account";
import { useWrite } from "./tx";
import { refreshAll, resolveSlug, usePoll } from "./squads";
import { DemoError } from "../store";
import { BURN } from "../money-out";
import type { Actions, JoinRequests, Payout, Period, Person, PublicTerms, RequestStatus } from "../types";

const PERIOD_INDEX: Record<Period, number> = { Demo: 0, Weekly: 1, Monthly: 2 };
const PAYOUT_KEY = "squadjar-payout";
const MAX = { amount: maxUint256 };
const pendingKey = (address: string) => `squadjar-pending-${address.toLowerCase()}`;
const publicFields = (pub?: PublicTerms) => (pub ? { visibility: "public", ...pub } : {});

/** An error friendlyError() maps by contract error name, without a round trip. */
const named = (errorName: string) => Object.assign(new Error(errorName), { errorName });

async function squadAt(slug: string) {
  const hit = await resolveSlug(slug);
  if (!hit) throw new Error("Squad not found");
  return hit;
}

export function useLiveActions(): Actions {
  const { write } = useWrite();
  const { getAccessToken } = usePrivy();
  const { address: me } = useMyAccount();

  return useMemo(() => {
    const authed = async (url: string, init?: RequestInit) => {
      const token = await getAccessToken();
      return fetch(url, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    };
    // Money-moving calls (lockDeposit, refillDeposit) first make sure this squad may pull sNGN; one approve per squad, later calls only read the allowance.
    const onSquad = async (slug: string, functionName: "leave" | "start" | "cancel" | "lockDeposit" | "refillDeposit") => {
      const { address } = await squadAt(slug);
      const pulls = functionName === "lockDeposit" || functionName === "refillDeposit";
      await write({ address, abi: squadAbi, functionName }, pulls ? { approve: { spender: address, ...MAX } } : undefined);
      await refreshAll();
    };

    const join = async (slug: string, code: string) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(code)) throw named("BadInvite");
      const { address } = await squadAt(slug);
      await write({ address, abi: squadAbi, functionName: "join", args: [code as Hex] });
      await refreshAll();
    };

    return {
      addMoney: async (amount) => {
        await write({ address: TOKEN, abi: tokenAbi, functionName: "faucet", args: [toUnits(amount)] });
        await refreshAll().catch(() => {}); // the money has moved: a failed refresh must not show an error
      },

      findPerson: async (username) => {
        const r = await authed(`/api/users/lookup?u=${encodeURIComponent(username)}`);
        if (r.status === 404 || r.status === 400) return null;
        if (!r.ok) throw new Error(`lookup ${r.status}`);
        return (await r.json()) as Person;
      },
      send: async (to, amount) => {
        if (me && to.toLowerCase() === me.toLowerCase()) throw new DemoError("errSendSelf");
        await write({ address: TOKEN, abi: tokenAbi, functionName: "transfer", args: [to, toUnits(amount)] });
        await refreshAll().catch(() => {}); // the money has moved: a failed refresh must not show an error
      },
      withdraw: async (amount) => {
        await write({ address: TOKEN, abi: tokenAbi, functionName: "transfer", args: [BURN, toUnits(amount)] });
        await refreshAll().catch(() => {}); // the money has moved: a failed refresh must not show an error
      },

      createSquad: async ({ name, contribution, size, period, due, pub }) => {
        name = name.trim();
        if (!name) throw new DemoError("errNameMissing");
        const code = toHex(crypto.getRandomValues(new Uint8Array(32)));
        const inviteHash = keccak256(encodeAbiParameters([{ type: "bytes32" }], [code]));
        const receipt = await write({
          address: FACTORY,
          abi: factoryAbi,
          functionName: "createSquad",
          args: [toUnits(contribution), size, PERIOD_INDEX[period], inviteHash, BigInt(due)],
        });
        const [created] = parseEventLogs({ abi: factoryAbi, eventName: "SquadCreated", logs: receipt.logs });
        if (!created) throw new Error("SquadCreated log missing");
        const squad = created.args.squad;
        // The squad exists now, so nothing below may throw (a retry would create a second one).
        // A failed approve is recovered by the approve-if-needed on lockDeposit / contribute / refill.
        await write({ address: TOKEN, abi: tokenAbi, functionName: "approve", args: [squad, maxUint256] }).catch(() => {});
        try {
          localStorage.setItem(pendingKey(squad), JSON.stringify({ address: squad, name, code, pub }));
        } catch {
          // storage blocked: the invite code then only lives in memory
        }
        const register = async () => {
          const r = await authed("/api/squads", { method: "POST", body: JSON.stringify({ address: squad, name, inviteCode: code, ...publicFields(pub) }) });
          if (!r.ok) throw new Error(`register ${r.status}`);
          const { slug } = (await r.json()) as { slug: string };
          try {
            localStorage.removeItem(pendingKey(squad));
          } catch {}
          return slug;
        };
        // If both fail the squad lives at /s/<its id>; the code stays in the pending entry and OpenView retries the registration.
        return register()
          .catch(register)
          .catch(() => squad.toLowerCase());
      },

      join,
      joinPublic: async (slug) => {
        const r = await authed(`/api/squads/${encodeURIComponent(slug)}/requests`, { method: "POST" });
        if (r.status === 409) {
          await refreshAll(); // the squad is no longer Open: the page switches to its "already started" notice
          throw new DemoError("startedTitle");
        }
        if (r.status === 403 && (await r.json().catch(() => null))?.error === "record") throw new DemoError("recordBlocked");
        if (!r.ok) throw new Error(`request ${r.status}`);
        const { status, code } = (await r.json()) as { status: RequestStatus; code?: string };
        await (code ? join(slug, code) : refreshAll()); // the code comes back once accepted; join with it like an invite link
        return status;
      },
      decideRequest: async (slug, member, decision) => {
        const r = await authed(`/api/squads/${encodeURIComponent(slug)}/requests`, { method: "PATCH", body: JSON.stringify({ member, decision }) });
        if (!r.ok) throw new Error(`decide ${r.status}`);
        await refreshAll();
      },
      leave: (slug) => onSquad(slug, "leave"),
      start: (slug) => onSquad(slug, "start"),
      cancel: (slug) => onSquad(slug, "cancel"),
      lockDeposit: (slug) => onSquad(slug, "lockDeposit"),
      refill: (slug) => onSquad(slug, "refillDeposit"),

      // ponytail: fallback for when the relayer isn't running; any member can settle, the fee is sponsored.
      settle: async (slug) => {
        const { address } = await squadAt(slug);
        const v = await publicClient.readContract({ address, abi: squadAbi, functionName: "getState" });
        if (v.state === 2) await write({ address, abi: squadAbi, functionName: "settleRound", args: [v.currentRound] });
        else if (v.state === 1) await write({ address, abi: squadAbi, functionName: "finalizeDeposits" });
        await refreshAll();
      },

      pay: async (slug) => {
        const { address, name } = await squadAt(slug);
        const receipt = await write({ address, abi: squadAbi, functionName: "contribute" }, { approve: { spender: address, ...MAX } });
        const [settled] = parseEventLogs({ abi: squadAbi, eventName: "RoundSettled", logs: receipt.logs });
        await refreshAll();
        if (!settled || !me || settled.args.collector.toLowerCase() !== me.toLowerCase()) return { settled: false };
        const { round, amount } = settled.args;
        // The money has moved: nothing below may throw. If the reads fail, covered is 0.
        let covered = 0;
        try {
          const view = await publicClient.readContract({ address, abi: squadAbi, functionName: "getState" });
          const paid = await publicClient.multicall({
            allowFailure: false,
            contracts: view.members.map((m: Address) => ({ address, abi: squadAbi, functionName: "paid", args: [BigInt(round), m] }) as const),
          });
          // ponytail: covered comes from the net RoundSettled amount (after owed repayment), so it can under-state the deposit share
          covered = Math.max(0, fromUnits(amount - BigInt(paid.filter(Boolean).length) * view.contribution)); // the rest came out of deposits
        } catch {}
        const payout: Payout = { slug, squadName: name, round, amount: fromUnits(amount), covered, at: Date.now() };
        try {
          sessionStorage.setItem(PAYOUT_KEY, JSON.stringify(payout));
        } catch {
          // storage blocked: the receipt page falls back to "No payout to show yet"
        }
        return { settled: true, payout };
      },
    };
  }, [write, getAccessToken, me]);
}

/** The payout the last live pay() handed off to /s/[slug]/payout. */
export function useLivePayout(): Payout | undefined {
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(PAYOUT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Payout) : undefined;
    } catch {
      return undefined;
    }
  }, [raw]);
}

/** The squad's invite code, for members (the API refuses everyone else). null: it could not be loaded. */
export function useLiveInviteCode(slug: string, enabled: boolean): string | null | undefined {
  const { getAccessToken } = usePrivy();
  const [got, setGot] = useState<{ slug: string; code: string | null }>();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const set = (code: string | null) => alive && setGot({ slug, code });
    (async () => {
      const token = await getAccessToken();
      const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
      const r = await fetch(`/api/squads/${encodeURIComponent(slug)}/invite`, { headers });
      if (r.ok) return set(((await r.json()) as { code: string }).code);
      // Registration failed at creation: use the local code now and retry the registration.
      let pending: { address: string; name: string; code: string; pub?: PublicTerms } | null = null;
      try {
        pending = JSON.parse(localStorage.getItem(pendingKey(slug)) ?? "null");
      } catch {}
      if (!pending) return set(null);
      set(pending.code);
      const reg = await fetch("/api/squads", { method: "POST", headers, body: JSON.stringify({ address: pending.address, name: pending.name, inviteCode: pending.code, ...publicFields(pending.pub) }) });
      if (reg.ok) {
        try {
          localStorage.removeItem(pendingKey(slug));
        } catch {}
      }
    })().catch(() => set(null));
    return () => {
      alive = false;
    };
  }, [slug, enabled, getAccessToken]);
  return got?.slug === slug ? got.code : undefined;
}

/** A public squad's join requests, polled: the organizer's pending list, or my own request's status. */
export function useLiveJoinRequests(slug: string, enabled: boolean): JoinRequests | undefined {
  const { getAccessToken } = usePrivy();
  const { address: me } = useMyAccount();
  return usePoll(enabled && me ? `requests:${me}:${slug}` : null, async () => {
    const token = await getAccessToken();
    const r = await fetch(`/api/squads/${encodeURIComponent(slug)}/requests`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`requests ${r.status}`);
    return (await r.json()) as JoinRequests;
  });
}

/** One signed-in GET per `key`: the JSON reply, or null when it failed (callers fall back). */
function useAuthedOnce<T>(url: string, key: string | null): T | null | undefined {
  const { getAccessToken } = usePrivy();
  const [got, setGot] = useState<{ key: string; v: T | null }>();
  useEffect(() => {
    if (!key) return;
    let alive = true;
    (async () => {
      const r = await fetch(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      return r.ok ? ((await r.json()) as T) : null;
    })()
      .catch(() => null)
      .then((v) => alive && setGot({ key, v }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers url
  }, [key]);
  return got?.key === key ? got.v : undefined;
}

/** Asks the server for the squad's WhatsApp reminder (Kimi, in my language): its wa.me link, or null. One billable call per tap. */
export function useLiveRemind(): (slug: string) => Promise<string | null> {
  const { getAccessToken } = usePrivy();
  return async (slug) => {
    const r = await fetch(`/api/squads/${encodeURIComponent(slug)}/remind`, { method: "POST", headers: { authorization: `Bearer ${await getAccessToken()}` } });
    return r.ok ? ((await r.json()) as { waLink: string }).waLink : null;
  };
}

export type Nudge = { squad: string; slug: string; squadName: string; body: string; sentAt: string };
/** My in-app pay nudges, newest first, read once per mount. */
export function useLiveNotifications(): Nudge[] | undefined {
  const { address: me } = useMyAccount();
  return useAuthedOnce<Nudge[]>("/api/notifications", me ? `notices:${me}` : null) ?? undefined;
}
