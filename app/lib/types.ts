export type Tier = "New" | "Building" | "Reliable";
export type Period = "Demo" | "Weekly" | "Monthly";
export type SquadState = "Open" | "Depositing" | "Active" | "Completed" | "Cancelled";

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
  depositDeadline: number; // epoch ms, 0 when not Depositing
  paid: Record<number, string[]>; // round -> member ids
  missed: Record<number, string[]>;
  stopped: string[];
  myDeposit: number;
  myRequired: number;
  myOwed: number;
};

export type Payout = { slug: string; squadName: string; round: number; amount: number; covered: number; at: number };
