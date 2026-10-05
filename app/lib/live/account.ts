"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { hasPrivy } from "./chain";

type Account = { ready: boolean; authenticated: boolean; address?: Address; email?: string; logout(): Promise<void> };
const demo: Account = { ready: true, authenticated: false, logout: async () => {} };

function usePrivyAccount(): Account {
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const w = wallets.find((x) => x.walletClientType === "privy") ?? wallets[0];
  return { ready, authenticated, address: (w?.address ?? user?.wallet?.address) as Address | undefined, email: user?.email?.address ?? user?.google?.email, logout };
}

// hasPrivy is a build-time constant, so the hook order never changes between renders.
export const useMyAccount: () => Account = hasPrivy ? usePrivyAccount : () => demo;
