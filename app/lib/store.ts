"use client";

// Demo data adapter. Screens talk to lib/data.ts, which picks this or the live chain read model.
// ponytail: localStorage-backed single-user demo; real multi-member state comes from Squad.getState().

import { useSyncExternalStore } from "react";
import type { Member, Payout, Period, Squad } from "./types";
import { DemoError } from "./errors";
export type { Member, Payout, Period, Squad, SquadState, Tier } from "./types";

export type State = {
  me: Member & { onTime: number };
  balance: number;
  squads: Squad[];
  lastPayout?: Payout;
  justStamped?: { slug: string; round: number };
};

export const ME = "me";
const KEY = "squadjar-demo-v3"; // v3: no deposit (held money and debt)
const H = 3_600_000;
const D = 24 * H;

export const PERIOD_MS: Record<Period, number> = { Demo: 5 * 60_000, Weekly: 7 * D, Monthly: 30 * D };
const GRACE_MS: Record<Period, number> = { Demo: 60_000, Weekly: 12 * H, Monthly: 2 * D };

// Fields the chain view adds; the demo derives them so screens see one shape.
function full(q: Omit<Squad, "organizerId" | "amMember" | "roundOpensAt" | "settleableAfter">): Squad {
  return {
    ...q,
    organizerId: q.members[0]?.id ?? ME,
    amMember: true,
    roundOpensAt: q.roundDeadline - PERIOD_MS[q.period],
    settleableAfter: q.roundDeadline + GRACE_MS[q.period],
  };
}
const CLEAR = { myHeld: 0, myOwed: 0, myCredit: 0, creditors: [] as string[] };
const ALLOWANCE = { New: 0, Building: 25, Reliable: 50 } as const;

function seed(): State {
  const now = Date.now();
  const csc: Member[] = [
    { id: "tolu", name: "Tolu", tier: "Reliable" },
    { id: "chidi", name: "Chidi", tier: "Building" },
    { id: "bola", name: "Bola", tier: "Building" },
    { id: ME, name: "Amaka", tier: "Reliable" },
    { id: "femi", name: "Femi", tier: "New" },
    { id: "zainab", name: "Zainab", tier: "New" },
    { id: "kelechi", name: "Kelechi", tier: "New" },
    { id: "ife", name: "Ifeoluwa", tier: "New" },
  ];
  const moremi: Member[] = [
    { id: "dami", name: "Dami", tier: "Building" },
    { id: "ngozi", name: "Ngozi", tier: "Reliable" },
    { id: "aisha", name: "Aisha", tier: "Building" },
    { id: "tomi", name: "Tomi", tier: "New" },
    { id: ME, name: "Amaka", tier: "Reliable" },
    { id: "ruth", name: "Ruth", tier: "New" },
  ];
  const everyone = (ms: Member[]) => ms.map((m) => m.id);
  return {
    me: { id: ME, name: "Amaka", tier: "Reliable", onTime: 22 },
    balance: 12500,
    squads: [
      full({
        slug: "csc-300l",
        name: "CSC 300L Squad",
        contribution: 5000,
        period: "Weekly",
        maxMembers: 8,
        members: csc,
        state: "Active",
        currentRound: 3,
        roundDeadline: now + 2 * D + 4 * H,
        paid: { 1: everyone(csc), 2: everyone(csc), 3: ["tolu", "chidi", "femi", "zainab", "kelechi"] },
        missed: {},
        ...CLEAR,
        myAllowance: ALLOWANCE.Reliable,
      }),
      full({
        slug: "moremi-hall",
        name: "Moremi Hall Girls",
        contribution: 2000,
        period: "Demo",
        maxMembers: 6,
        members: moremi,
        state: "Active",
        currentRound: 5,
        roundDeadline: now + 4 * 60_000,
        paid: {
          1: everyone(moremi),
          2: everyone(moremi),
          // I missed round 3 with nothing held yet, so it is debt: Aisha, round 3's collector, was paid short.
          3: everyone(moremi).filter((id) => id !== ME),
          4: everyone(moremi).filter((id) => id !== "tomi"), // Tomi missed their own round: a smaller payout, no debt
          5: ["dami", "ngozi", "aisha", "tomi", "ruth"],
        },
        missed: { 3: [ME], 4: ["tomi"] },
        ...CLEAR,
        myAllowance: ALLOWANCE.Reliable,
        myOwed: 2000,
        creditors: ["aisha"],
      }),
    ],
  };
}

let state: State | null = null;
const listeners = new Set<() => void>();

function load(): State {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? (JSON.parse(raw) as State) : seed();
  } catch {
    state = seed();
  }
  return state;
}

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked (private mode): the demo still works for this tab
  }
  listeners.forEach((l) => l());
}

const SERVER_STATE = seed();

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(load()),
    () => select(SERVER_STATE),
  );
}

export function getState() {
  return load();
}

export function resetDemo() {
  commit(seed());
}

export function squadBySlug(s: State, slug: string) {
  return s.squads.find((q) => q.slug === slug);
}

export function collectorOf(q: Squad, round = q.currentRound) {
  return q.members[round - 1];
}

export function payoutAmount(q: Squad) {
  return q.contribution * q.members.length;
}

export function myTurn(q: Squad) {
  return q.members.findIndex((m) => m.id === ME) + 1;
}

/** What the jar holds back from my payout (Squad._settle): the rounds I still owe after my turn, less my tier's allowance. */
export function heldAtMyTurn(q: Squad) {
  const left = q.members.length - myTurn(q);
  return Math.min(payoutAmount(q), (q.contribution * left * (100 - q.myAllowance)) / 100);
}

export { DemoError };

export function addMoney(amount: number) {
  const s = load();
  if (!Number.isFinite(amount) || amount < 100) throw new DemoError("errAddAtLeast");
  if (amount > 200000) throw new DemoError("errTopUpCap");
  commit({ ...s, balance: s.balance + amount });
}

/** Pays this round. When it completes the round, the jar pays the collector. */
export function payRound(slug: string): { settled: boolean; payout?: Payout } {
  const s = load();
  const q = squadBySlug(s, slug);
  if (!q || q.state !== "Active") throw new DemoError("notCollecting");
  const r = q.currentRound;
  if ((q.paid[r] ?? []).includes(ME)) throw new DemoError("errAlreadyPaid");
  if (s.balance < q.contribution) throw new DemoError("errAddToPay", { amount: `₦${(q.contribution - s.balance).toLocaleString("en-NG")}` });

  const paid = { ...q.paid, [r]: [...(q.paid[r] ?? []), ME] };
  let balance = s.balance - q.contribution;
  let next: Squad = { ...q, paid };
  let payout: Payout | undefined;

  if (paid[r].length === q.members.length) {
    const collector = collectorOf(q, r);
    let { myHeld, myOwed, creditors } = q;
    if (collector.id === ME) {
      // Like Squad._settle: my debt comes out of my payout first, then the held part stays in the jar.
      const repay = Math.min(myOwed, payoutAmount(q));
      const held = Math.min(payoutAmount(q) - repay, heldAtMyTurn(q));
      const amount = payoutAmount(q) - repay - held;
      balance += amount;
      myHeld += held;
      myOwed -= repay;
      if (!myOwed) creditors = [];
      payout = { slug, squadName: q.name, round: r, amount, held, at: Date.now() };
    }
    const done = r === q.members.length;
    if (done) {
      balance += myHeld; // held money comes back at the end
      myHeld = 0;
    }
    const deadline = done ? q.roundDeadline : Math.max(q.roundDeadline + PERIOD_MS[q.period], Date.now() + PERIOD_MS[q.period]);
    // The demo's other members are not real, so they pay the next round as soon as it opens.
    if (!done) paid[r + 1] = q.members.filter((m) => m.id !== ME).map((m) => m.id);
    next = full({
      ...next,
      state: done ? "Completed" : "Active",
      currentRound: done ? r : r + 1,
      roundDeadline: deadline,
      myHeld,
      myOwed,
      creditors,
    });
  }

  commit({
    ...s,
    balance,
    me: { ...s.me, onTime: s.me.onTime + 1 },
    squads: s.squads.map((x) => (x.slug === slug ? next : x)),
    lastPayout: payout ?? s.lastPayout,
    justStamped: { slug, round: r },
  });
  return { settled: !!payout, payout };
}

/** Pays my whole debt in a squad; in the demo it simply leaves my balance. */
export function payBack(slug: string) {
  const s = load();
  const q = squadBySlug(s, slug);
  if (!q || q.myOwed <= 0) throw new DemoError("errNothingOwed");
  if (s.balance < q.myOwed) throw new DemoError("errAddToPay", { amount: `₦${(q.myOwed - s.balance).toLocaleString("en-NG")}` });
  commit({ ...s, balance: s.balance - q.myOwed, squads: s.squads.map((x) => (x.slug === slug ? { ...x, myOwed: 0, creditors: [] } : x)) });
}

export function clearJustStamped() {
  const s = load();
  if (s.justStamped) commit({ ...s, justStamped: undefined });
}

export function createSquad(input: { name: string; contribution: number; size: number; period: Period }): string {
  const s = load();
  const name = input.name.trim();
  if (!name) throw new DemoError("errNameMissing");
  if (name.length > 40) throw new DemoError("errNameLong");
  if (!(input.contribution >= 100)) throw new DemoError("errContributionMin");
  if (!(input.size >= 3 && input.size <= 20)) throw new DemoError("errSquadSize");
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "squad";
  let slug = base;
  for (let i = 2; s.squads.some((q) => q.slug === slug); i++) slug = `${base}-${i}`;
  const squad = full({
    slug,
    name,
    contribution: Math.round(input.contribution),
    period: input.period,
    maxMembers: input.size,
    members: [{ id: ME, name: s.me.name, tier: s.me.tier }],
    state: "Open",
    currentRound: 0,
    roundDeadline: 0,
    paid: {},
    missed: {},
    ...CLEAR,
    myAllowance: ALLOWANCE[s.me.tier],
  });
  commit({ ...s, squads: [squad, ...s.squads] });
  return slug;
}
