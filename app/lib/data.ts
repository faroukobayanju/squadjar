"use client";

// The one module screens read from. Demo (localStorage store) or live (chain read model), picked at build time.
import { useMemo } from "react";
import * as store from "./store";
import { isLive } from "./live/chain";
import { useLiveMe, useLivePublicSquads, useLiveRecords, useLiveSquad, useLiveSquads } from "./live/squads";
import { useLiveActions, useLiveInviteCode, useLiveJoinRequests, useLivePayout } from "./live/actions";
import type { Actions, JoinRequests, PublicSquad, Squad, Tier } from "./types";
import type { PayRecord } from "./record-line";

export type { JoinRequest, Member, Payout, Period, Person, PublicSquad, PublicTerms, RequestStatus, Squad, SquadState, Tier } from "./types";
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

// The fresh stamp is demo-only. The payout receipt comes from the store (demo) or pay()'s sessionStorage handoff (live).
export const useJustStamped = (slug: string) => store.useStore((s) => (!isLive && s.justStamped?.slug === slug ? s.justStamped : undefined));
const useDemoPayout = () => store.useStore((s) => s.lastPayout);
export const useLastPayout = isLive ? useLivePayout : useDemoPayout;
/** Members' invite code (live only; the demo has no joining). */
export const useInviteCode: (slug: string, enabled: boolean) => string | null | undefined = isLive ? useLiveInviteCode : () => undefined;
/** Public squads and join requests are live only; demo screens hide them. */
export const usePublicSquads: () => PublicSquad[] | null | undefined = isLive ? useLivePublicSquads : () => undefined;
export const useJoinRequests: (slug: string, enabled: boolean) => JoinRequests | undefined = isLive ? useLiveJoinRequests : () => undefined;
/** Payment records by lowercase id; live only, the demo hides them. */
export const useRecords: (ids: readonly string[]) => Record<string, PayRecord> | undefined = isLive ? useLiveRecords : () => undefined;
export const clearJustStamped = store.clearJustStamped;
export const resetDemo = store.resetDemo;

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms)); // network-shaped, so a press reads as a real action
const notInDemo = async () => {
  throw new store.DemoError("errNotInDemo");
};
const demoActions: Actions = {
  addMoney: async (amount) => (await pause(700), store.addMoney(amount)),
  createSquad: async (input) => store.createSquad(input),
  findPerson: notInDemo,
  send: notInDemo,
  withdraw: notInDemo,
  pay: async (slug) => (await pause(650), store.payRound(slug)),
  join: notInDemo,
  joinPublic: notInDemo,
  decideRequest: notInDemo,
  leave: notInDemo,
  start: notInDemo,
  lockDeposit: notInDemo,
  refill: notInDemo,
  cancel: notInDemo,
  settle: async () => {},
};

export const useActions: () => Actions = isLive ? useLiveActions : () => demoActions;
