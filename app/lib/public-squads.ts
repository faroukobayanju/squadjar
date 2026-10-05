// Pure: who may ask to join a public squad, and who gets its invite code. Tiers are registry values (0 New, 1 Building, 2 Reliable).
import type { RequestStatus } from "./types";

export const canRequest = ({ tier, minTier }: { tier: number; minTier: number }) => tier >= minTier;

/** Members always; a public squad's requester once accepted and still at its minimum tier; nobody else. */
export function codeReleasable(x: { isMember: boolean; isPublic: boolean; tier: number; minTier: number; requestStatus: RequestStatus | null }) {
  if (x.isMember) return true;
  return x.isPublic && x.requestStatus === "accepted" && canRequest(x);
}
