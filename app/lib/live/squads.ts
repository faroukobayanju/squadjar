"use client";

// Live read model: polls the chain (and the names/slugs API) every 4s and maps it to the UI's Squad.
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { factoryAbi, registryAbi, squadAbi } from "./abi";
import { FACTORY, publicClient, readBalance } from "./chain";
import { useMyAccount } from "./account";
import { startChainClock } from "./clock";
import { TIERS, toSquad } from "../chain-map";
import type { PublicSquad, PublicTerms, Squad, Tier } from "../types";
import type { PayRecord } from "../record-line";

const POLL_MS = 4000;

// Every live poll's tick, so a write can refresh screens now instead of on the next 4s tick.
const ticks = new Set<() => Promise<void>>();
export const refreshAll = () => Promise.all([...ticks].map((t) => t())).then(() => {});

/**
 * Runs `fn` now and every 4s while `key` is set; skips a tick while the last fetch is still running. `key` must cover everything `fn` reads.
 * With `throwAfter`, that many failures in a row before any value throws during render, so the route's error.tsx offers Retry.
 */
export function usePoll<T>(key: string | null, fn: () => Promise<T>, throwAfter = Infinity): T | undefined {
  const [got, setGot] = useState<{ key: string; v: T }>();
  const [fails, setFails] = useState<{ key: string; n: number }>();
  useEffect(() => {
    startChainClock();
    if (!key) return;
    let alive = true;
    let running: Promise<void> | undefined;
    const tick = () =>
      (running ??= (async () => {
        try {
          const v = await fn();
          if (alive) {
            setGot({ key, v });
            setFails(undefined);
          }
        } catch {
          // keep the last good value; the next tick retries
          if (alive) setFails((f) => ({ key, n: f?.key === key ? f.n + 1 : 1 }));
        } finally {
          running = undefined;
        }
      })());
    ticks.add(tick);
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      ticks.delete(tick);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers fn's inputs
  }, [key]);
  const v = got && got.key === key ? got.v : undefined;
  if (v === undefined && fails?.key === key && fails.n >= throwAfter) throw new Error("Couldn't load this right now");
  return v;
}

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null; // 503 (not configured) and errors degrade to fallbacks
}

let registry: Promise<Address> | undefined;
const getRegistry = () =>
  (registry ??= publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "registry" }).catch((e) => {
    registry = undefined;
    throw e;
  }));

async function tiersOf(who: readonly Address[]): Promise<Record<string, Tier>> {
  const reg = await getRegistry();
  const res = await publicClient.multicall({
    allowFailure: false,
    contracts: who.map((a) => ({ address: reg, abi: registryAbi, functionName: "tier", args: [a] }) as const),
  });
  return Object.fromEntries(who.map((a, i) => [a.toLowerCase(), TIERS[res[i]] ?? "New"]));
}

const namesOf = async (who: readonly Address[]) =>
  who.length ? ((await getJson<Record<string, string>>(`/api/names?a=${who.join(",")}`)) ?? {}) : {};

// Finished rounds never change, so each (squad, round) is read once per page load.
const historyCache = new Map<string, Address[]>();

async function loadSquad(address: Address, slug: string, name: string, me: Address, pub?: PublicTerms | null): Promise<Squad> {
  const view = await publicClient.readContract({ address, abi: squadAbi, functionName: "getState" });
  const last = view.state === 3 ? view.currentRound : view.state === 2 ? view.currentRound - 1 : 0; // Completed : Active
  const todo: number[] = [];
  for (let r = 1; r <= last; r++) if (!historyCache.has(`${address}:${r}`)) todo.push(r);
  const [names, tiers, paid] = await Promise.all([
    namesOf(view.members),
    tiersOf(view.members),
    todo.length
      ? publicClient.multicall({
          allowFailure: false,
          contracts: todo.flatMap((r) => view.members.map((m) => ({ address, abi: squadAbi, functionName: "paid", args: [BigInt(r), m] }) as const)),
        })
      : [],
  ]);
  todo.forEach((r, j) => historyCache.set(`${address}:${r}`, view.members.filter((_, i) => paid[j * view.members.length + i])));
  const history: Record<number, Address[]> = {};
  for (let r = 1; r <= last; r++) history[r] = historyCache.get(`${address}:${r}`) ?? [];
  return { ...toSquad({ address, slug, name, view, history, names, tiers, me }), pub: pub ?? undefined };
}

// ponytail: scans every squad; index by Membership logs or the DB when squads > ~500
async function loadMySquads(me: Address): Promise<Squad[]> {
  const n = Number(await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "squadCount" }));
  if (!n) return [];
  const all = await publicClient.multicall({
    allowFailure: false,
    contracts: Array.from({ length: n }, (_, i) => ({ address: FACTORY, abi: factoryAbi, functionName: "squads", args: [BigInt(i)] }) as const),
  });
  const member = await publicClient.multicall({
    allowFailure: false,
    contracts: all.map((a) => ({ address: a, abi: squadAbi, functionName: "isMember", args: [me] }) as const),
  });
  const mine = all.filter((_, i) => member[i]).reverse(); // newest first, like the demo
  if (!mine.length) return [];
  const meta = (await getJson<Record<string, { slug: string; name: string }>>(`/api/squads?a=${mine.join(",")}`)) ?? {};
  // Without a DB row the squad is still reachable: /s/<its address> resolves directly.
  return Promise.all(mine.map((a) => loadSquad(a, meta[a.toLowerCase()]?.slug ?? a.toLowerCase(), meta[a.toLowerCase()]?.name ?? "Squad", me)));
}

// Hits only: a 404 may be a squad whose row is still being written (right after create), so misses are re-asked each poll.
type Hit = { address: Address; name: string; pub?: PublicTerms | null };
const slugCache = new Map<string, Hit>();

export async function resolveSlug(slug: string): Promise<Hit | null> {
  const cached = slugCache.get(slug);
  if (cached) return cached;
  let hit: Hit | null;
  if (/^0x[0-9a-fA-F]{40}$/.test(slug)) {
    const address = slug as Address;
    const ok = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isSquad", args: [address] });
    const meta = ok ? await getJson<Record<string, { name: string }>>(`/api/squads?a=${address}`) : null;
    hit = ok ? { address, name: meta?.[address.toLowerCase()]?.name ?? "Squad" } : null;
  } else {
    const r = await fetch(`/api/squads/${encodeURIComponent(slug)}`);
    if (r.status === 404) hit = null;
    else if (!r.ok) throw new Error("squad lookup unavailable"); // retried on the next poll
    else {
      // "public" is /api/squads/public (a list), never a squad.
      const body = slug === "public" ? null : ((await r.json()) as Hit);
      hit = body?.address ? body : null;
    }
  }
  if (hit) slugCache.set(slug, hit);
  return hit;
}

export function useLiveSquads(): Squad[] | undefined {
  const { address: me } = useMyAccount();
  return usePoll(me ? `squads:${me}` : null, () => loadMySquads(me!));
}

export function useLiveSquad(slug: string): Squad | null | undefined {
  const { address: me } = useMyAccount();
  return usePoll(
    me ? `squad:${me}:${slug}` : null,
    async () => {
      const hit = await resolveSlug(slug);
      return hit ? loadSquad(hit.address, slug, hit.name, me!, hit.pub) : null;
    },
    3,
  );
}

export function useLiveMe() {
  const { address: me, email } = useMyAccount();
  return usePoll(me ? `me:${me}` : null, async () => {
    const reg = await getRegistry();
    const [names, [score, tier, rec], balance] = await Promise.all([
      namesOf([me!]),
      publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: reg, abi: registryAbi, functionName: "trustScore", args: [me!] },
          { address: reg, abi: registryAbi, functionName: "tier", args: [me!] },
          { address: reg, abi: registryAbi, functionName: "records", args: [me!] },
        ],
      }),
      readBalance(me!),
    ]);
    return {
      name: names[me!.toLowerCase()] ?? email?.split("@")[0] ?? "there",
      tier: TIERS[tier] ?? ("New" as Tier),
      score: Number(score),
      onTime: rec[0],
      balance,
    };
  });
}

/** Open public squads, fetched once per mount (each fetch reads every listed squad onchain, so it doesn't poll). null: couldn't load. */
export function useLivePublicSquads(): PublicSquad[] | null | undefined {
  const [list, setList] = useState<PublicSquad[] | null>();
  useEffect(() => {
    let alive = true;
    getJson<PublicSquad[]>("/api/squads/public")
      .catch(() => null)
      .then((x) => alive && setList(x));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** Payment records by lowercase id (GET /api/record is public). Ids that aren't 0x addresses (the demo's "me") are skipped. */
export function useLiveRecords(ids: readonly string[]): Record<string, PayRecord> | undefined {
  const who = [...new Set(ids.map((a) => a.toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))].sort();
  return usePoll(who.length ? `records:${who.join(",")}` : null, async () => {
    const r = await getJson<Record<string, PayRecord>>(`/api/record?a=${who.join(",")}`);
    if (!r) throw new Error("records unavailable"); // keep the last good value
    return r;
  });
}
