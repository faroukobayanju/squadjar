// Pure: on-chain SquadView -> the UI's Squad. Type-only imports so `node lib/chain-map.check.ts` runs without a bundler.
import { formatUnits, type Address, type ContractFunctionReturnType } from "viem";
import type { squadAbi } from "./live/abi";
import type { Period, Squad, SquadState, Tier } from "./types";

export type SquadView = ContractFunctionReturnType<typeof squadAbi, "view", "getState">;

const STATES: SquadState[] = ["Open", "Depositing", "Active", "Completed", "Cancelled"];
export const TIERS: Tier[] = ["New", "Building", "Reliable"];
const ME = "me"; // same value as store.ts ME; duplicated so this file stays dependency-free for node
const naira = (x: bigint) => Number(formatUnits(x, 18)); // sNGN has 18 decimals
const ms = (s: bigint | number) => Number(s) * 1000;

export const periodOf = (roundLength: number): Period => (roundLength === 300 ? "Demo" : roundLength === 604800 ? "Weekly" : "Monthly");

export function toSquad(input: {
  address: Address;
  slug: string;
  name: string;
  view: SquadView;
  history: Record<number, readonly Address[]>; // finished round -> members who paid it
  names: Record<string, string>; // lowercase address -> display name
  tiers: Record<string, Tier>; // lowercase address -> tier
  me: Address;
}): Squad {
  const { view: v, history, names, tiers } = input;
  const me = input.me.toLowerCase();
  const id = (a: Address) => (a.toLowerCase() === me ? ME : a.toLowerCase());
  const state = STATES[v.state] ?? "Open";
  const r = v.currentRound;
  const mine = v.members.findIndex((a) => a.toLowerCase() === me);

  const paid: Record<number, string[]> = {};
  const missed: Record<number, string[]> = {};
  const last = state === "Completed" ? r : r - 1; // rounds that are finished
  for (let k = 1; k <= last; k++) {
    const ids = (history[k] ?? []).map(id);
    paid[k] = ids;
    missed[k] = v.members.map(id).filter((m) => !ids.includes(m));
  }
  if (state === "Active") paid[r] = v.members.filter((_, i) => v.paidThisRound[i]).map(id);

  return {
    slug: input.slug,
    address: input.address,
    name: input.name,
    contribution: naira(v.contribution),
    period: periodOf(v.roundLength),
    maxMembers: v.maxMembers,
    members: v.members.map((a, i) => ({ id: id(a), name: names[a.toLowerCase()] ?? `Member ${i + 1}`, tier: tiers[a.toLowerCase()] ?? "New" })),
    organizerId: id(v.organizer),
    amMember: mine >= 0,
    state,
    currentRound: r,
    roundDeadline: ms(v.roundDeadline),
    roundOpensAt: ms(v.roundDeadline - BigInt(v.roundLength)),
    settleableAfter: ms(v.settleableAfter),
    depositDeadline: state === "Depositing" ? ms(v.depositDeadline) : 0,
    paid,
    missed,
    stopped: v.members.filter((_, i) => v.stopped[i]).map(id),
    depositsIn: v.members.filter((_, i) => v.locked[i] >= v.required[i]).map(id),
    myDeposit: mine >= 0 ? naira(v.locked[mine]) : 0,
    myRequired: mine >= 0 ? naira(v.required[mine]) : 0,
    myOwed: mine >= 0 ? naira(v.owed[mine]) : 0,
  };
}
