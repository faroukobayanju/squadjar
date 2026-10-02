"use client";

// Demo data adapter. The screens only talk to this module, so swapping it for the
// Monad contracts (Plan 2) replaces this file, not the UI.
// ponytail: localStorage-backed single-user demo; real multi-member state comes from Squad.getState().

import { useSyncExternalStore } from "react";

export type Tier = "New" | "Building" | "Reliable";
export type Period = "Demo" | "Weekly" | "Monthly";
export type SquadState = "Open" | "Depositing" | "Active" | "Completed";

export type Member = { id: string; name: string; tier: Tier };

export type Squad = {
  slug: string;
  name: string;
  contribution: number;
  period: Period;
  maxMembers: number;
  members: Member[]; // turn order once started: index 0 collects round 1
  state: SquadState;
  currentRound: number;
  roundDeadline: number; // epoch ms
  paid: Record<number, string[]>; // round -> member ids
  missed: Record<number, string[]>;
  myDeposit: number;
};

export type Payout = { slug: string; squadName: string; round: number; amount: number; covered: number; at: number };

export type State = {
  me: Member & { onTime: number };
  balance: number;
  squads: Squad[];
  lastPayout?: Payout;
  justStamped?: { slug: string; round: number };
};

export const ME = "me";
const KEY = "squadjar-demo-v1";
const H = 3_600_000;
const D = 24 * H;

export const PERIOD_MS: Record<Period, number> = { Demo: 5 * 60_000, Weekly: 7 * D, Monthly: 30 * D };

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
    { id: "ruth", name: "Ruth", tier: "New" },
    { id: ME, name: "Amaka", tier: "Reliable" },
  ];
  const everyone = (ms: Member[]) => ms.map((m) => m.id);
  return {
    me: { id: ME, name: "Amaka", tier: "Reliable", onTime: 22 },
    balance: 12500,
    squads: [
      {
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
        myDeposit: 10000,
      },
      {
        slug: "moremi-hall",
        name: "Moremi Hall Girls",
        contribution: 2000,
        period: "Demo",
        maxMembers: 6,
        members: moremi,
        state: "Active",
        currentRound: 6,
        roundDeadline: now + 4 * 60_000,
        paid: {
          1: everyone(moremi),
          2: everyone(moremi),
          3: everyone(moremi),
          4: everyone(moremi).filter((id) => id !== "tomi"),
          5: everyone(moremi),
          6: ["dami", "ngozi", "aisha", "tomi", "ruth"],
        },
        missed: { 4: ["tomi"] },
        myDeposit: 2000,
      },
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

export class DemoError extends Error {}

export function addMoney(amount: number) {
  const s = load();
  if (!Number.isFinite(amount) || amount < 100) throw new DemoError("Add at least ₦100.");
  if (amount > 200000) throw new DemoError("Test top-ups are capped at ₦200,000 at a time.");
  commit({ ...s, balance: s.balance + amount });
}

/** Pays this round. When it completes the round, the jar pays the collector. */
export function payRound(slug: string): { settled: boolean; payout?: Payout } {
  const s = load();
  const q = squadBySlug(s, slug);
  if (!q || q.state !== "Active") throw new DemoError("This squad isn't collecting right now.");
  const r = q.currentRound;
  if ((q.paid[r] ?? []).includes(ME)) throw new DemoError("You've already paid this round.");
  if (s.balance < q.contribution) throw new DemoError(`Add ₦${(q.contribution - s.balance).toLocaleString("en-NG")} to pay.`);

  const paid = { ...q.paid, [r]: [...(q.paid[r] ?? []), ME] };
  let balance = s.balance - q.contribution;
  let next: Squad = { ...q, paid };
  let payout: Payout | undefined;

  if (paid[r].length === q.members.length) {
    const collector = collectorOf(q, r);
    const amount = payoutAmount(q);
    if (collector.id === ME) {
      balance += amount;
      payout = { slug, squadName: q.name, round: r, amount, covered: 0, at: Date.now() };
    }
    const done = r === q.members.length;
    if (done && collector.id === ME) balance += q.myDeposit; // deposit refunded at the end
    next = {
      ...next,
      state: done ? "Completed" : "Active",
      currentRound: done ? r : r + 1,
      roundDeadline: done ? q.roundDeadline : Math.max(q.roundDeadline + PERIOD_MS[q.period], Date.now() + PERIOD_MS[q.period]),
      myDeposit: done ? 0 : q.myDeposit,
    };
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

export function clearJustStamped() {
  const s = load();
  if (s.justStamped) commit({ ...s, justStamped: undefined });
}

export function createSquad(input: { name: string; contribution: number; size: number; period: Period }): string {
  const s = load();
  const name = input.name.trim();
  if (!name) throw new DemoError("Give your squad a name.");
  if (name.length > 40) throw new DemoError("Keep the name under 40 characters.");
  if (!(input.contribution >= 100)) throw new DemoError("Contributions start at ₦100.");
  if (!(input.size >= 3 && input.size <= 20)) throw new DemoError("A squad is 3 to 20 people.");
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "squad";
  let slug = base;
  for (let i = 2; s.squads.some((q) => q.slug === slug); i++) slug = `${base}-${i}`;
  const squad: Squad = {
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
    myDeposit: 0,
  };
  commit({ ...s, squads: [squad, ...s.squads] });
  return slug;
}
