"use client";

// Live writes (sponsored, via useWrite) and the signed-in API calls that go with them.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { encodeAbiParameters, keccak256, maxUint256, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { factoryAbi, squadAbi, tokenAbi } from "./abi";
import { FACTORY, TOKEN, fromUnits, publicClient, toUnits } from "./chain";
import { useMyAccount } from "./account";
import { useWrite } from "./tx";
import { refreshAll, resolveSlug } from "./squads";
import { DemoError } from "../store";
import type { Actions, Payout, Period } from "../types";

const PERIOD_INDEX: Record<Period, number> = { Demo: 0, Weekly: 1, Monthly: 2 };
const PAYOUT_KEY = "squadjar-payout";
const MAX = { amount: maxUint256 };

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

    return {
      addMoney: async (amount) => {
        await write({ address: TOKEN, abi: tokenAbi, functionName: "faucet", args: [toUnits(amount)] });
        await refreshAll();
      },

      createSquad: async ({ name, contribution, size, period, due }) => {
        name = name.trim();
        if (!name) throw new DemoError("Give your squad a name.");
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
        const register = async () => {
          const r = await authed("/api/squads", { method: "POST", body: JSON.stringify({ address: squad, name, inviteCode: code }) });
          if (!r.ok) throw new Error(`register ${r.status}`);
          return ((await r.json()) as { slug: string }).slug;
        };
        // ponytail: if both registers fail the invite code is lost and the squad lives at /s/<its id> with no invite link; persist the code locally if this shows up
        return register()
          .catch(register)
          .catch(() => squad.toLowerCase());
      },

      join: async (slug, code) => {
        if (!/^0x[0-9a-fA-F]{64}$/.test(code)) throw named("BadInvite");
        const { address } = await squadAt(slug);
        await write({ address, abi: squadAbi, functionName: "join", args: [code as Hex] }, { approve: { spender: address, ...MAX } });
        await refreshAll();
      },
      leave: (slug) => onSquad(slug, "leave"),
      start: (slug) => onSquad(slug, "start"),
      cancel: (slug) => onSquad(slug, "cancel"),
      lockDeposit: (slug) => onSquad(slug, "lockDeposit"),
      refill: (slug) => onSquad(slug, "refillDeposit"),

      pay: async (slug) => {
        const { address, name } = await squadAt(slug);
        const receipt = await write({ address, abi: squadAbi, functionName: "contribute" }, { approve: { spender: address, ...MAX } });
        const [settled] = parseEventLogs({ abi: squadAbi, eventName: "RoundSettled", logs: receipt.logs });
        await refreshAll();
        if (!settled || !me || settled.args.collector.toLowerCase() !== me.toLowerCase()) return { settled: false };
        const { round, amount } = settled.args;
        const view = await publicClient.readContract({ address, abi: squadAbi, functionName: "getState" });
        const paid = await publicClient.multicall({
          allowFailure: false,
          contracts: view.members.map((m: Address) => ({ address, abi: squadAbi, functionName: "paid", args: [BigInt(round), m] }) as const),
        });
        const covered = amount - BigInt(paid.filter(Boolean).length) * view.contribution; // the rest came out of deposits
        const payout: Payout = { slug, squadName: name, round, amount: fromUnits(amount), covered: Math.max(0, fromUnits(covered)), at: Date.now() };
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

/** The squad's invite code, for members (the API refuses everyone else). */
export function useLiveInviteCode(slug: string, enabled: boolean): string | undefined {
  const { getAccessToken } = usePrivy();
  const [got, setGot] = useState<{ slug: string; code: string }>();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const token = await getAccessToken();
      const r = await fetch(`/api/squads/${encodeURIComponent(slug)}/invite`, { headers: { authorization: `Bearer ${token}` } });
      if (r.ok && alive) setGot({ slug, code: ((await r.json()) as { code: string }).code });
    })().catch(() => {}); // no link: the invite button stays hidden
    return () => {
      alive = false;
    };
  }, [slug, enabled, getAccessToken]);
  return got?.slug === slug ? got.code : undefined;
}
