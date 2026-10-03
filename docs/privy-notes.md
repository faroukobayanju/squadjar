# Privy notes (docs.privy.io, checked 2026-10-03)

Packages: `@privy-io/react-auth` (client), `@privy-io/node` (server; replaces deprecated `@privy-io/server-auth`), `viem`.

```tsx
// Provider
<PrivyProvider appId={id} config={{
  loginMethods: ["email", "google"],
  defaultChain: monadTestnet, supportedChains: [monadTestnet],
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
}}>

// Headless login
const { sendCode, loginWithCode } = useLoginWithEmail();   // sendCode({ email }), loginWithCode({ code })
const { initOAuth } = useLoginWithOAuth();                 // initOAuth({ provider: "google" })

// Session / wallet
const { ready, authenticated, user, logout } = usePrivy();
const { wallets } = useWallets();                          // embedded: walletClientType === "privy"

// Sponsored write (returns { hash }, no receipt)
const { sendTransaction } = useSendTransaction();
await sendTransaction({ to, data, chainId }, { address: wallet.address, sponsor: true });
```

- Sponsorship needs "Fee sponsorship" enabled in the Privy dashboard with Monad testnet selected. Docs examples only show Ethereum/Tempo; Monad testnet support is unconfirmed (check in dashboard before relying on it).
- The user must add `http://localhost:3100` (and the prod domain) under allowed origins in the dashboard.

Server (Task 2):
```ts
import { PrivyClient } from "@privy-io/node";
const privy = new PrivyClient({ appId, appSecret });
const claims = await privy.utils().auth().verifyAuthToken(accessToken); // claims.user_id
```
Client gets the token with `getAccessToken()` from `usePrivy()`; send as `Authorization: Bearer`. Setting the dashboard verification key avoids a network call per verify.
