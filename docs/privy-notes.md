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

## Auto-pay setup (Task 6)

Checked 2026-10-03 against docs.privy.io (llms-full.txt: "Add a signer", "Example policies: Ethereum", "Policies overview") and the installed type defs (`@privy-io/react-auth` 3.47.0, `@privy-io/node` 0.35.0).

How it works: the member adds Squadjar's key quorum as a *signer* on their account with the auto-pay policy. The cron then sends `contribute()` from the member's account, signed with the app authorization key and sponsored. The squad contract sets the amount (exactly the contribution), so the signer can never move more.

Exact calls used:
```ts
// Client (app/components/autopay-toggle.tsx)
const { addSigners, removeSigners } = useSigners();          // @privy-io/react-auth
await addSigners({ address, signers: [{ signerId: NEXT_PUBLIC_PRIVY_SIGNER_ID, policyIds: [NEXT_PUBLIC_PRIVY_AUTOPAY_POLICY_ID] }] });
await removeSigners({ address });                            // removes ALL signers ("Stop auto-pay everywhere")

// Server (app/lib/autopay.ts)
const page = await privy.wallets().list({ address, chain_type: "ethereum" });   // wallet id + additional_signers
await privy.wallets().ethereum().sendTransaction(walletId, {
  caip2: "eip155:10143", sponsor: true,
  params: { transaction: { to: squad, data: "0xd7bb99ba", value: "0x0", chain_id: 10143 } },
  authorization_context: { authorization_private_keys: [PRIVY_AUTH_PRIVATE_KEY] },
});                                                          // → { hash, transaction_id?, ... }
```
The server only sends when the account's `additional_signers` has our `signer_id` with the policy id in `override_policy_ids` (fails closed).

Policy limits: `ethereum_transaction` conditions only support `to`, `value`, `chain_id`; there is no raw-calldata/selector condition. The narrowest rule is an `ethereum_calldata` condition with `field: "function_name"`, `value: "contribute"` and the one-entry ABI (Privy decodes the calldata with that ABI, so only `contribute()` matches). `to` cannot match "any squad from the factory", so it is left open; `contribute()` only pulls from the caller into the squad it is called on, and only for squads the member approved.

Dashboard steps (the user does these once):
1. Generate an authorization key locally:
   `openssl ecparam -name prime256v1 -genkey -noout -out private.pem && openssl ec -in private.pem -pubout -out public.pem`
   The private key (base64 body of `private.pem`, PKCS8; the dashboard's `wallet-auth:` prefixed form also works) goes in `PRIVY_AUTH_PRIVATE_KEY`. Never commit it.
2. Dashboard → Authorization keys → New key → "Register key quorum instead". Paste the public key, threshold 1, name "Squadjar auto-pay". Copy the key quorum id into `NEXT_PUBLIC_PRIVY_SIGNER_ID`.
3. Dashboard → Policies → New policy (or `privy.policies().create`), copy its id into `NEXT_PUBLIC_PRIVY_AUTOPAY_POLICY_ID`:
   ```json
   { "version": "1.0", "name": "Squadjar auto-pay", "chain_type": "ethereum",
     "rules": [{ "name": "contribute only", "method": "eth_sendTransaction", "action": "ALLOW",
       "conditions": [
         { "field_source": "ethereum_transaction", "field": "chain_id", "operator": "eq", "value": "10143" },
         { "field_source": "ethereum_transaction", "field": "value", "operator": "eq", "value": "0x0" },
         { "field_source": "ethereum_calldata", "field": "function_name", "operator": "eq", "value": "contribute",
           "abi": [{ "type": "function", "name": "contribute", "inputs": [], "outputs": [], "stateMutability": "nonpayable" }] }
       ] }] }
   ```
   Everything else is denied by default.
4. Gas sponsorship: same "Fee sponsorship" setting as client writes; confirm it applies to server-initiated (`sponsor: true`) requests on Monad testnet.
5. Run `npm run db:migrate` (adds the `autopay` table), then point cron-job.org at `GET /api/cron/autopay` with header `x-cron-secret` every minute.
