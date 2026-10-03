"use client";

// The one module screens read from. Demo (localStorage store) or live (chain read model), picked at build time.
import { useMemo } from "react";
import * as store from "./store";
import { isLive, toUnits, TOKEN } from "./live/chain";
import { tokenAbi } from "./live/abi";
import { useWrite } from "./live/tx";
import { useLiveMe, useLiveSquad, useLiveSquads } from "./live/squads";
import type { Period, Squad, Tier } from "./types";

export type { Member, Payout, Period, Squad, SquadState, Tier } from "./types";
export { isLive };
export { ME, DemoError, collectorOf, payoutAmount, myTurn, squadBySlug } from "./store";

export type Me = { name: string; tier: Tier; score: number; onTime: number; balance: number };

const useDemoSquads = () => store.useStore((s) => s.squads);
const useDemoSquad = (slug: string) => store.useStore((s) => store.squadBySlug(s, slug)) ?? null;
function useDemoMe(): Me {
  const me = store.useStore((s) => s.me);
  const balance = store.useStore((s) => s.balance);
  return useMemo(() => ({ name: me.name, tier: me.tier, score: me.onTime, onTime: me.onTime, balance }), [me, balance]);
}

// isLive is a build-time constant, so each hook's internal hook order never changes.
export const useSquads: () => Squad[] | undefined = isLive ? useLiveSquads : useDemoSquads;
/** undefined = loading, null = not found. */
export const useSquad: (slug: string) => Squad | null | undefined = isLive ? useLiveSquad : useDemoSquad;
export const useMe: () => Me | undefined = isLive ? useLiveMe : useDemoMe;

/** The landing page's example card is always the demo squad, signed in or not. */
export const useSampleSquad = () => store.useStore((s) => s.squads[0]);

// Demo-only moments (the fresh stamp and the payout receipt). Live returns nothing until Task 4 wires events.
export const useJustStamped = (slug: string) => store.useStore((s) => (!isLive && s.justStamped?.slug === slug ? s.justStamped : undefined));
export const useLastPayout = () => store.useStore((s) => (isLive ? undefined : s.lastPayout));
export const clearJustStamped = store.clearJustStamped;
export const resetDemo = store.resetDemo;

type Actions = {
  addMoney(amount: number): Promise<void>;
  createSquad(input: { name: string; contribution: number; size: number; period: Period }): Promise<string>;
  join(slug: string, code: string): Promise<void>;
  leave(slug: string): Promise<void>;
  start(slug: string): Promise<void>;
  lockDeposit(slug: string): Promise<void>;
  pay(slug: string): Promise<{ settled: boolean }>;
  refill(slug: string): Promise<void>;
  cancel(slug: string): Promise<void>;
};

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms)); // network-shaped, so a press reads as a real action
const notInDemo = async () => {
  throw new store.DemoError("Not available in the demo yet.");
};
const demoActions: Actions = {
  addMoney: async (amount) => (await pause(700), store.addMoney(amount)),
  createSquad: async (input) => store.createSquad(input),
  pay: async (slug) => (await pause(650), store.payRound(slug)),
  join: notInDemo,
  leave: notInDemo,
  start: notInDemo,
  lockDeposit: notInDemo,
  refill: notInDemo,
  cancel: notInDemo,
};

const notReady = async (): Promise<never> => {
  throw new Error("Not ready yet");
};
function useLiveActions(): Actions {
  const { write } = useWrite();
  return useMemo(
    () => ({
      addMoney: async (amount) => {
        await write({ address: TOKEN, abi: tokenAbi, functionName: "faucet", args: [toUnits(amount)] });
      },
      createSquad: notReady,
      join: notReady,
      leave: notReady,
      start: notReady,
      lockDeposit: notReady,
      pay: notReady,
      refill: notReady,
      cancel: notReady,
    }),
    [write],
  );
}

export const useActions: () => Actions = isLive ? useLiveActions : () => demoActions;
