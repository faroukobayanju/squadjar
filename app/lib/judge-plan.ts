// Pure decisions for the judge demo bots (Ada organizes, Tunde joins). One step per squad per cron run;
// the contract's own checks (via simulation) have the final say. Overdue settles are left to the settle cron.
// SquadState on-chain: 0 Open, 2 Active, 3 Completed, 4 Cancelled (1 Depositing is never entered).
export type JudgeView = {
  state: number;
  contribution: bigint;
  maxMembers: number;
  roundLength: number;
  grace: number;
  roundDeadline: bigint;
  organizer: string;
  members: readonly string[];
  paidThisRound: readonly boolean[];
  owed: readonly bigint[];
};

export type BotFn = "join" | "start" | "contribute" | "payBack";
/** `approve` = what the squad will pull from the bot (0 = nothing). */
export type JudgeStep = { kind: "finished" } | { kind: "call"; bot: 0 | 1; fn: BotFn; approve: bigint } | null;

const BOTS = [0, 1] as const;

/** `bots` = [Ada, Tunde]; `now` = chain time in seconds. */
export function planJudgeStep(v: JudgeView, bots: readonly [string, string], now: bigint): JudgeStep {
  const at = (b: 0 | 1) => v.members.findIndex((m) => m.toLowerCase() === bots[b].toLowerCase());
  const none = BigInt(0);
  if (v.state === 4) return { kind: "finished" };
  if (v.state === 0) {
    if (v.organizer.toLowerCase() !== bots[0].toLowerCase()) return null;
    if (v.members.length >= v.maxMembers) return { kind: "call", bot: 0, fn: "start", approve: none };
    if (at(1) < 0) return { kind: "call", bot: 1, fn: "join", approve: none };
    return null; // waiting for a judge
  }
  // A bot that missed a round pays its debt back first (works while Active and after Completed).
  for (const b of BOTS) {
    const i = at(b);
    if (i >= 0 && v.owed[i] > none) return { kind: "call", bot: b, fn: "payBack", approve: v.owed[i] };
  }
  if (v.state === 3) return { kind: "finished" };
  if (v.state === 2) {
    // contribute() reverts RoundNotOpen before roundDeadline - roundLength and PastGrace after roundDeadline + grace.
    if (now < v.roundDeadline - BigInt(v.roundLength) || now > v.roundDeadline + BigInt(v.grace)) return null;
    for (const b of BOTS) {
      const i = at(b);
      if (i >= 0 && !v.paidThisRound[i]) return { kind: "call", bot: b, fn: "contribute", approve: v.contribution };
    }
  }
  return null;
}

/** A new demo squad is needed when no unfinished one is Open with a free seat. */
export const needsNextSquad = (views: readonly JudgeView[]) => !views.some(hasSeat);
export const hasSeat = (v: JudgeView) => v.state === 0 && v.members.length < v.maxMembers;
