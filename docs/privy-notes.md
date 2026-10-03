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

## Relayer upgrade (swap `RELAYER_PRIVATE_KEY` for a policy-scoped Privy server wallet)

Today `app/lib/relayer.ts` signs with a viem account from `RELAYER_PRIVATE_KEY`. The key lives only in `relayerAccount()`; `poke()` simulates first, so only the send step changes.

Policy facts (docs.privy.io/controls/policies/overview, checked 2026-10-03): a policy is a list of rules per RPC method, default DENY, DENY beats ALLOW. A rule's conditions can use `field_source: "ethereum_calldata"` with the contract `abi` and `field: "<function_name>"` to match any call to a function. `to` can only be compared to a static value, `in` (up to 100) or a condition set, never to "anything the factory deployed". So the policy can restrict by function but not by squad address. That is acceptable: `settleRound(uint8)` and `finalizeDeposits()` are public and harmless on any contract.

Steps:
1. Dashboard (or REST `POST /v1/policies`, Node SDK `privy.policies().create`): policy `chain_type: "ethereum"`, one rule on method `eth_sendTransaction`, `action: "ALLOW"`, conditions: `ethereum_transaction.chain_id eq 10143`, and `ethereum_calldata.settleRound` (abi: the `settleRound` entry of `squadAbi`) in one rule; a second rule for `ethereum_calldata.finalizeDeposits` with its abi. Nothing else is allowed by default.
2. Create a server wallet (`chain_type: "ethereum"`, `policy_ids: [<policy id>]`, owned by an authorization key so only the server can use it). Save the wallet id as a new env var (e.g. `RELAYER_WALLET_ID`) and the authorization key as `PRIVY_AUTH_PRIVATE_KEY` (already in `.env.example`).
3. Fund the wallet's address with testnet MON (Monad charges the gas limit; sponsorship does not cover server wallets unless enabled for them).
4. In `relayer.ts`: keep the `plan()` read, the `simulateContract` call and the 1.2x gas estimate (use `account: <wallet address>` for the simulation). Replace only the `wallet.writeContract(...)` line with the Privy `eth_sendTransaction` call for that wallet id (Node SDK `@privy-io/node`, wallets API; REST `POST /v1/wallets/{wallet_id}/rpc`), passing `{ to, data: encodeFunctionData(...), gas_limit, chain_id: 10143 }` and the authorization signature. Confirm the exact call shape against docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction (server tab) when doing this; not verified here.
5. Remove `RELAYER_PRIVATE_KEY`.
