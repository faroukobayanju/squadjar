export type Tier = "New" | "Building" | "Reliable";
export type Period = "Demo" | "Weekly" | "Monthly";
export type SquadState = "Open" | "Active" | "Completed" | "Cancelled";

export type Member = { id: string; name: string; tier: Tier };

export type Squad = {
  slug: string;
  address?: `0x${string}`;
  name: string;
  contribution: number;
  period: Period;
  maxMembers: number;
  members: Member[]; // turn order once started; index 0 collects round 1
  organizerId: string; // member id (ME when it's me)
  amMember: boolean;
  state: SquadState;
  currentRound: number;
  roundDeadline: number; // epoch ms
  roundOpensAt: number; // epoch ms = roundDeadline - roundLength; contributing earlier reverts RoundNotOpen
  settleableAfter: number; // epoch ms
  paid: Record<number, string[]>; // round -> member ids
  missed: Record<number, string[]>;
  myHeld: number; // held from my payout; comes back at the end
  myAllowance: number; // 0, 25 or 50: % of what I still owe after my turn that is not held (fixed at start by tier)
  myOwed: number; // debt: missed contributions my held money didn't cover
  myCredit: number; // what I was paid short and am still owed
  creditors: string[]; // member ids with credit, in turn order: who a pay back reaches first
};

/** Someone found by @username, to send money to. */
export type Person = { displayName: string; username: string; address: `0x${string}` };

/** `amount` reached my balance now; `held` waits in the jar until the end. */
export type Payout = { slug: string; squadName: string; round: number; amount: number; held: number; at: number };

/** Screens call these through useActions(); demo and live implement the same shape. `due` is round 1's deadline anchor (epoch seconds, 0 = none). */
export type Actions = {
  addMoney(amount: number): Promise<void>;
  /** null: nobody has this username. */
  findPerson(username: string): Promise<Person | null>;
  send(to: `0x${string}`, amount: number): Promise<void>;
  /** Test mode: the money leaves the balance for good; nothing reaches a bank. */
  withdraw(amount: number): Promise<void>;
  createSquad(input: { name: string; contribution: number; size: number; period: Period; due: number }): Promise<string>;
  join(slug: string, code: string): Promise<void>;
  leave(slug: string): Promise<void>;
  start(slug: string): Promise<void>;
  pay(slug: string): Promise<{ settled: boolean; payout?: Payout }>;
  /** Pays my whole debt in this squad; it goes straight to the members with credit. */
  payBack(slug: string): Promise<void>;
  cancel(slug: string): Promise<void>;
  /** Settle an overdue round from this member's own account. */
  settle(slug: string): Promise<void>;
};
