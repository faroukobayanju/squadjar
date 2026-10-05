# Privy security handbook: what matters for Squadjar

Source: Privy Security Handbook (user's copy, 48 pages). Full specs at trust.privy.io.

## Facts we can use

- **Custody.** Keys are split into shares and rebuilt only inside secure enclaves (TEEs) for signing. Neither Privy nor Squadjar can move a member's money. This backs the "nobody holds the money" pitch at the account level too, not just the jar contract.
- **Login hardening is Privy's job.** IP/JA4 rate limits, PKCE for OAuth, origin validation, Turnstile. Squadjar adds nothing here.
- **Policy engine.** Each signing request is checked against a policy: allowed RPC methods, approved contracts, field constraints, allow/deny. Sensitive actions can require MFA.
- **Owners and signers.** The user owns the account; the app can be added as a *signer* limited by a policy (e.g. "only call this contract", "at most X per transaction"). The user can revoke it at any time.
- **Scoped gas sponsorship.** The account still signs; the sponsor only pays fees. Policies limit which calls get sponsored.
- **Key quorums.** M-of-N approval, for example for the TrustRegistry owner before any mainnet launch (TODOS: multisig registry owner).

## How they map to our work

| Idea | Where | Status |
|---|---|---|
| Scope sponsorship to our contracts (token, factory, squads) | Privy dashboard sponsorship policy | Do on setup; this is the faucet-spam mitigation in TODOS |
| Relayer as a Privy server wallet with a policy that allows only `settleRound` / `finalizeDeposits` | Plan 2 Task 5 | Implementer checks whether policies can match dynamic squad addresses; else private key |
| **Auto-pay:** member adds Squadjar as a signer limited to `contribute()` on their squads, capped at the contribution per round | New feature | Proposed. Strongest "beyond login" Privy bounty story, and it cuts misses |
| Registry owner behind a 2-of-3 quorum | Mainnet only | TODOS P2 |
