export const KNOWN: Record<string, string> = {
  AlreadyPaid: "You've already paid this round.",
  PastGrace: "This round has closed. The jar covered it from your deposit.",
  RoundNotOpen: "This round isn't open yet.",
  DeadlineTooFar: "Pick a first due day within the next 60 days.",
  BadInvite: "This invite link doesn't work. Ask for a fresh one.",
  Full: "This squad is full.",
  AlreadyMember: "You're already in this squad.",
  TooFewMembers: "You need at least 3 people to start.",
  NothingOwed: "Your deposit is already in.",
  MemberStoppedPaying: "You've been marked as stopped paying in this squad.",
  FaucetCapExceeded: "Test top-ups are capped at ₦200,000 at a time.",
  ERC20InsufficientBalance: "Not enough balance. Add money first.",
};

/** Contract error name attached by lib/live/tx.ts, or found on a viem error's cause chain. */
function errorName(e: unknown): string | undefined {
  for (let x = e as { cause?: unknown; errorName?: string; data?: { errorName?: string } } | undefined, i = 0; x && i < 8; i++) {
    const n = x.errorName ?? x.data?.errorName;
    if (n) return n;
    x = x.cause as typeof x;
  }
}

export function friendlyError(e: unknown, kind: "payment" | "other"): string {
  const n = errorName(e);
  if (n && KNOWN[n]) return KNOWN[n];
  return kind === "payment" ? "Payment didn't go through. Your money is safe." : "That didn't go through. Try again.";
}
