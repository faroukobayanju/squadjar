// Pure decisions for the judge demo bots (Ada organizes, Tunde joins). One step per squad per cron run;
// the contract's own checks (via simulation) have the final say. Overdue settles and expired deposit
// windows are left to the settle cron. SquadState on-chain: 0 Open, 1 Depositing, 2 Active, 3 Completed, 4 Cancelled.
export type JudgeView = {
  state: number;
  contribution: bigint;
  maxMembers: number;
  roundLength: number;
  grace: number;
  depositDeadline: bigint;
  roundDeadline: bigint;
  organizer: string;
  members: readonly string[];
  locked: readonly bigint[];
  required: readonly bigint[];
  paidThisRound: readonly boolean[];
  stopped: readonly boolean[];
};

export type BotFn = "join" | "start" | "lockDeposit" | "contribute";
/** `approve` = what the squad will pull from the bot (0 = nothing). */
export type JudgeStep = { kind: "finished" } | { kind: "call"; bot: 0 | 1; fn: BotFn; approve: bigint } | null;

const BOTS = [0, 1] as const;

/** `bots` = [Ada, Tunde]; `now` = chain time in seconds. */
export function planJudgeStep(v: JudgeView, bots: readonly [string, string], now: bigint): JudgeStep {
  const at = (b: 0 | 1) => v.members.findIndex((m) => m.toLowerCase() === bots[b].toLowerCase());
  const none = BigInt(0);
  if (v.state === 3 || v.state === 4) return { kind: "finished" };
  if (v.state === 0) {
    if (v.organizer.toLowerCase() !== bots[0].toLowerCase()) return null;
    if (v.members.length >= v.maxMembers) return { kind: "call", bot: 0, fn: "start", approve: none };
    if (at(1) < 0) return { kind: "call", bot: 1, fn: "join", approve: none };
    return null; // waiting for a judge
  }
  if (v.state === 1) {
    if (now > v.depositDeadline) return null; // finalizeDeposits is the settle cron's job
    for (const b of BOTS) {
      const i = at(b);
      if (i >= 0 && v.locked[i] < v.required[i]) return { kind: "call", bot: b, fn: "lockDeposit", approve: v.required[i] - v.locked[i] };
    }
    return null;
  }
  if (v.state === 2) {
    // contribute() reverts RoundNotOpen before roundDeadline - roundLength and PastGrace after roundDeadline + grace.
    if (now < v.roundDeadline - BigInt(v.roundLength) || now > v.roundDeadline + BigInt(v.grace)) return null;
    for (const b of BOTS) {
      const i = at(b);
      if (i >= 0 && !v.paidThisRound[i] && !v.stopped[i]) return { kind: "call", bot: b, fn: "contribute", approve: v.contribution };
    }
  }
  return null;
}

/** A new demo squad is needed when no unfinished one is Open with a free seat. */
export const needsNextSquad = (views: readonly JudgeView[]) => !views.some(hasSeat);
export const hasSeat = (v: JudgeView) => v.state === 0 && v.members.length < v.maxMembers;
