"use client";

import { PrivyProvider } from "@privy-io/react-auth";
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
      {children}
    </PrivyProvider>
  );
}
