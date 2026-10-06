import type { Key, T, Vars } from "./i18n/core";

/** Contract error name -> the copy key people see. */
export const KNOWN: Record<string, Key> = {
  AlreadyPaid: "errAlreadyPaid",
  PastGrace: "errPastGrace",
  RoundNotOpen: "errRoundNotOpen",
  DeadlineTooFar: "errDeadlineTooFar",
  BadInvite: "errBadInvite",
  Full: "errFull",
  AlreadyMember: "errAlreadyMember",
  TooFewMembers: "errTooFewMembers",
  NothingOwed: "errNothingOwed",
  MemberStoppedPaying: "errStoppedPaying",
  FaucetCapExceeded: "errTopUpCap",
  ERC20InsufficientBalance: "errNotEnough",
};

/** A known, user-facing failure caught before anything is sent: carries its copy key, shown as-is. */
export class DemoError extends Error {
  key: Key;
  vars?: Vars;
  constructor(key: Key, vars?: Vars) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}

/** Contract error name attached by lib/live/tx.ts, or found on a viem error's cause chain. */
function errorName(e: unknown): string | undefined {
  for (let x = e as { cause?: unknown; errorName?: string; data?: { errorName?: string } } | undefined, i = 0; x && i < 8; i++) {
    const n = x.errorName ?? x.data?.errorName;
    if (n) return n;
    x = x.cause as typeof x;
  }
}

export function friendlyError(e: unknown, kind: "payment" | "other", t: T): string {
  if (e instanceof DemoError) return t(e.key, e.vars);
  const n = errorName(e);
  if (n && KNOWN[n]) return t(KNOWN[n]);
  console.error("[write failed]", e); // unknown failures: keep the real cause visible in the console
  return t(kind === "payment" ? "errPayment" : "errGeneric");
}
