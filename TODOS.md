# TODOS

## Contracts

- **Turn-order randomness.** `block.prevrandao` may be constant on Monad testnet, and the organizer picks when `start()` runs. Fix: commit-reveal, or a seed from a later block. Check on deploy day (Task 6 Step 6). P3.
- **Signed invites.** The invite code is public calldata after the first join. Organizer `remove()` mitigates this. Proper fix: the organizer signs `(squad, member)` and `join` verifies it. P3.
- **Fairness invariants.** Fuzz `finalizeDeposits` and `cancel`, and assert "a member who stopped paying never ends with more than they started" plus "a member with no misses loses at most X". P2.
- **Social vouching / uncollateralized slots.** This is the 12-month credit story (CEO review). P3.
- **Multisig registry owner** before any mainnet deploy. P2.
- **Seed script** for a demo squad, owned by Plan 2. P2.
- **Trust farming with free money.** One person can run many weekly squads with their own accounts and reach Reliable in about a week, then take turn 1 with a 3c deposit and stop paying. Fix before any real-money launch: count trust only across distinct counterparties and cap trust earned per week. P1 (mainnet).
- **Monthly drift.** Monthly is a fixed 30 days, so it drifts against payday. Calendar-month deadlines need a date library onchain or an offchain schedule. P3.

## App (Plan 2)

- **Finalize stuck deposits.** The cron must also call `finalizeDeposits()` on squads in Depositing past `depositDeadline`, not only settle Active squads. P1.
- **Settle-on-view spends relayer gas.** Simulate with `eth_call` first and send only if it would succeed; rate-limit per squad. P1.
- **Fund the relayer early.** Testnet MON faucets are rate-limited. Monad charges gas on the gas limit, not gas used: don't pad limits. P1.
- **Faucet spam on sponsorship.** Rate-limit Add money per user (server check or Privy policy). P2.
- **Missing contract states in the UI.** Cancelled, stopped paying, refill deposit, owed, and "Round opens in X" (`RoundNotOpen` after an early settle). P1.
- **Trust never moves in demo squads.** Demo squads write no trust (decision A). Seed demo records through a separate allowlisted demo writer, or say it plainly in the pitch. P2.
- **Email nudges need a provider.** Pick one (e.g. Resend) or cut email and keep in-app plus WhatsApp. P2.
- **Kimi `lookupTrust(displayName)`.** Names aren't unique and it exposes others' records. Look up squad members by account instead. P2.

## Product (wider audience)

- **Upfront deposit size.** Turn 1 of 10 at ₦5k locks ₦45k. Have the pitch answer ready; explore smaller deposits for Building members. P2.
- **Daily rounds and groups over 20.** Market esusu is often daily and larger. P3.
- **Phone login.** Traders and older users live on phone numbers; Privy SMS outside US/CA is Enterprise-only. P3.
- **Turn swaps.** Two members agree to swap turns ("I need mine in March for rent"). P3.
- **Mainnet naira.** Plan B needs a naira stablecoin on Monad (unverified) or USDC shown as naira with FX risk, plus a licensed partner for real naira. P3.
