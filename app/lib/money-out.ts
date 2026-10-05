// Pure helpers for Send and Withdraw. No runtime imports, so node runs the check directly.

/** Where test-mode cash-outs go: sNGN sent here is gone for good, and history files it as "withdraw". */
export const BURN = "0x000000000000000000000000000000000000dEaD";
export const MIN_OUT = 100;

export const BANKS = [
  "Access Bank", "GTBank", "First Bank", "UBA", "Zenith Bank", "Fidelity Bank", "FCMB", "Union Bank",
  "Stanbic IBTC", "Sterling Bank", "Wema Bank", "Polaris Bank", "Kuda", "OPay", "Moniepoint", "PalmPay",
] as const;

export const validAccountNumber = (s: string) => /^\d{10}$/.test(s);
export const maskAccount = (s: string) => `••••${s.slice(-4)}`;
/** "@Ada " -> "ada"; null when it can't be a username (same rule as POST /api/users). */
export const normUsername = (s: string) => {
  const u = s.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(u) ? u : null;
};
/** Why this amount can't go out: below the minimum, or more than the balance. null when it's fine. */
export const amountProblem = (amount: number, balance: number): "min" | "short" | null =>
  !(amount >= MIN_OUT) ? "min" : amount > balance ? "short" : null;
