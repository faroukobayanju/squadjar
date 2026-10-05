"use client";

import { useEffect, useRef } from "react";
import { PrivyProvider, useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/live/chain";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false }, // copy-ok: Privy config, never shown
      }}
    >
      <EnsureAccount />
      {children}
    </PrivyProvider>
  );
}

/**
 * Creates the user's embedded account if Privy didn't at login (accounts made while
 * dashboard "create on login" was off). Waits first so Privy's own creation can land:
 * createWallet shows Privy's loading screen, so it should only run when really needed.
 */
function EnsureAccount() {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const tried = useRef(false);
  const hasAccount = !!user?.linkedAccounts.some((a) => a.type === "wallet" && "walletClientType" in a && a.walletClientType === "privy"); // copy-ok: Privy account type, never shown
  useEffect(() => {
    if (!ready || !authenticated || !user || hasAccount || tried.current) return;
    const t = setTimeout(() => {
      tried.current = true;
      createWallet().catch((e) => console.error("[account create]", e));
    }, 3000);
    return () => clearTimeout(t);
  }, [ready, authenticated, user, hasAccount, createWallet]);
  return null;
}
