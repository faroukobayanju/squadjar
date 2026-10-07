<p align="center"><img src="brand/squadjar-logo.png" alt="Squadjar" width="160"></p>

# Squadjar

Ajo without a treasurer. Your group saves together, each person's payout lands on schedule, and nobody can run off with the money.

Live: https://squadjar.vercel.app

Built for Monad Metropolis, Consumer Products & Payments track.

## The problem

- Ajo (esusu) usually runs through one person, the alajo, who holds everyone's cash and can disappear with it.
- Members who already collected have no reason to keep paying, so the people at the end of the line lose.
- Records live on paper or in a WhatsApp chat, which leads to disputes about who paid.

## How Squadjar works

- **Squad**: 3 to 20 members saving together. Whoever creates it is the organizer, and has no powers once rounds begin.
- **Jar**: the squad's shared money. No member, including the organizer, controls it. It is held by a contract.
- **Rounds**: each round, every member pays the same **contribution** into the jar. At the end of the round the jar pays the whole **payout** to that round's **collector**. A squad of n members runs n rounds, and everyone collects once.
- **Turn order**: decided by **trust score** when the squad starts. Higher score collects earlier, ties are broken randomly.
- **Deposits**: before rounds begin each member locks a refundable **deposit**. If someone misses a round, their deposit covers the contribution, so the collector is still paid in full. Deposits come back at the end. A no-deposit hold-back model, where a collector's payout is held back instead of asking for a deposit up front, is in progress (issue #27).
- **Stopped paying**: a member who misses and does not refill their deposit is treated as missing all remaining rounds. Their deposit covers what it can, and what is left after the last round is shared among members who never missed.
- **Trust score and tiers**: built from payment history across every squad: on-time payments add, late payments and misses subtract, finishing a squad adds. Tiers are New, Building and Reliable. Reliable members have a capped deposit. Demo squads do not write to the trust score.
- **Private squads**: a squad is joined only with its invite link and code. The organizer shares the link on WhatsApp, and can remove a member before rounds begin.

## Try it (judges)

1. Open https://squadjar.vercel.app and log in with email or Google. Or use the test account. Test login: see submission form.
2. Add money (test mode). This is a simulated card checkout that credits test naira.
3. Join the live demo squad at https://squadjar.vercel.app/try. Two bot members play with you. Demo squads use 5-minute rounds, so a full squad takes about 15 minutes.
4. What you will see: lock your deposit, pay each round, a payout receipt when you collect, your deposit refunded at the end, and the squad's history showing who paid.

All money is test money on Monad testnet.

## What's onchain

Monad testnet, chain 10143. Source of the addresses: `contracts/deployments/10143.json`.

| Contract | What it does | Address |
|---|---|---|
| AjoNGN (sNGN) | Test naira token with a capped faucet, used for the add-money screen | [`0xb7A5...10C9`](https://testnet.monadexplorer.com/address/0xb7A57BeF0DD01A96C7626fDD6F143C9127d110C9) |
| TrustRegistry | Stores every person's payment record and computes the trust score and tier | [`0xe80e...3eCB`](https://testnet.monadexplorer.com/address/0xe80e9A23B647CD653F3A5ef16222aD6794C23eCB) |
| SquadFactory | Creates one Squad contract per squad (the jar) and registers it with the registry | [`0x7B2a...5d4B`](https://testnet.monadexplorer.com/address/0x7B2aC330515073De9aCB8883ee0AAA8cE11B5d4B) |

Each squad is its own contract that holds the jar, runs the rounds and pays out. Every payment, payout, refund and trust write is a real onchain transaction. Users never see any of it: login uses Privy embedded accounts, and fees are sponsored, so a new user with no MON can complete the whole flow. All three contracts are verified on Sourcify. Contract details: [contracts/README.md](contracts/README.md).

## Built with

- **Monad**: the chain that holds the jars and the trust record.
- **Privy**: email and Google login, embedded accounts, fee sponsorship, and a policy-limited signer for auto-pay that can only call `contribute()` with zero value.
- **Kimi**: drafts a squad from plain language ("8 of us, 5k every Friday"), writes reminders in five languages, and writes the WhatsApp remind message.
- Next.js 16, Neon Postgres (display data only), Vercel, Foundry.

Money, membership, turn order, deposits and trust live only onchain. Postgres holds names, invite codes and notifications.

## Languages

English, Pidgin, Yorùbá, Igbo, Hausa.

## Testing

- Contracts: `cd contracts && forge test` (74 tests, including 2 invariant tests).
- End to end: `scripts/e2e/run.sh` runs 11 scenarios against the deployed contracts on a Monad testnet fork (happy path, misses, stopped paying, cancelled squads, late settle, trust score, round timing). Every jar ends at ₦0. See [scripts/e2e/README.md](scripts/e2e/README.md).

## Run locally

Prerequisites: Node.js, and Foundry if you want to run the contract tests.

```
cd app
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev -- -p 3100
```

Open http://localhost:3100. Without env vars the app runs on demo data. To go live, fill in `.env.local`:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Login and embedded accounts |
| `DATABASE_URL` | Neon Postgres (needed for `db:migrate`) |
| `NEXT_PUBLIC_FACTORY`, `NEXT_PUBLIC_TOKEN` | Contract addresses from the table above |
| `RELAYER_PRIVATE_KEY`, `CRON_SECRET` | Settling overdue rounds, and protecting the cron routes |
| `PRIVY_AUTH_PRIVATE_KEY`, `NEXT_PUBLIC_PRIVY_SIGNER_ID`, `NEXT_PUBLIC_PRIVY_AUTOPAY_POLICY_ID` | Auto-pay (see [docs/privy-notes.md](docs/privy-notes.md)) |
| `NEXT_PUBLIC_APP_URL` | Base URL for shared links |
| `KIMI_API_KEY`, `KIMI_MODEL`, `KIMI_BASE_URL` | Kimi (see [docs/kimi-notes.md](docs/kimi-notes.md)); without a key the app uses a pattern parser and message templates |

## Business model

Planned for mainnet, not live. Details in [docs/business-model.md](docs/business-model.md).

- A 1% payout fee, capped, charged only when someone collects. A traditional alajo typically keeps one day of the month's collection for the same job.
- A share of the yield earned on money that is locked in deposits and jars.
- Group plans for associations and cooperatives.
- Credit partners who use the trust record, with the member's consent.

## Team

- Farouk (product, app): [faroukobayanju](https://github.com/faroukobayanju)
- Osas Haikeys (contracts, infrastructure): [Haikeysgit](https://github.com/Haikeysgit)

## Status and roadmap

Live on Monad testnet:
- Create, invite, join, start, deposits, pay, automatic payout, deposit refund
- Trust score and tiers
- Auto-pay
- Kimi squad drafting and reminders in five languages
- In-app nudges and WhatsApp remind
- Live demo squad with bot members

Next:
- Earned turns and the no-deposit hold-back model (issue #27)
- Monad mainnet
- Real bank deposits and withdrawals (today add money is a test-mode simulation)
- Phone number login
- Daily squads

No real-user results yet. We have not claimed any.
