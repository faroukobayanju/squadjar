# Epic: Squadjar v1, rotating savings where nobody holds the jar

Status: DRAFT (awaiting approval)
Hackathon: Monad Metropolis, Consumer Products & Payments track, plus the Privy, Kimi, and Community bounties
Deadline: 2026-10-14 04:59 GMT+1
Glossary: [CONTEXT.md](../../../CONTEXT.md) (all terms below are used exactly as defined there)
Design record: [docs/designs/ajo-circles.md](../../designs/ajo-circles.md)

## Context

Nigerian students run ajo, esusu, and class dues through one person's bank account and a WhatsApp list. When that person disappears, or a member who already collected stops paying, everyone after them loses. Typical group-savings apps digitize the ledger but still leave one admin in control of the cash and the records. Squadjar puts the money in a jar that no member controls: contracts on Monad collect contributions, pay each round's collector on schedule, and cover misses from refundable deposits. The app must feel like an ordinary fintech app, with no crypto words or prompts anywhere.

Who is affected: Nigerian undergraduates (18 to 24) in class, department, or friend squads of 3 to 20, usually started by a class rep. Hackathon judges evaluate the live product.

## Current State

Greenfield. Verified 2026-10-02: `/Users/zorak/Desktop/metropolis` contains only `CONTEXT.md` and `docs/`. It is not a git repo yet. The `gh` CLI is authenticated as `faroukobayanju`.

Verified platform facts (2026-10-02):

| Fact | Consequence |
|---|---|
| Privy native gas sponsorship supports Monad testnet, and Privy subsidizes Monad testnet usage | Embedded wallets with `sponsor: true`. No smart wallet is needed. |
| Privy `fundWallet` does not support testnets | Top-up is simulated with an `AjoNGN` faucet behind a card-style screen |
| Privy SMS outside US/CA is Enterprise-only | Login is email + Google |
| Vercel Hobby cron runs once a day | cron-job.org calls our cron routes every minute |

## Proposed Change

```
Browser (Next.js PWA) --Privy embedded wallet, sponsored tx--> Squad contracts (Monad testnet)
        |                                                          ^
        v                                                          |
Next.js API routes --Neon Postgres (names, slugs, nudge log)       |
        |  \--Kimi API (draft squad, write nudges)                  |
        \--Privy server wallet (relayer) ----settleRound()---------/
cron-job.org --every 1 min--> /api/cron/settle, /api/cron/nudge
```

Money, membership, turn order, deposits, and trust live only onchain. Postgres holds only display data.

### Implementation Details

#### 1. Contracts (`contracts/`, Foundry, Solidity ^0.8.24)

**`AjoNGN.sol`**: an OpenZeppelin ERC20 named "Squadjar Naira" with symbol `sNGN` and 18 decimals.
- `faucet(uint256 amount)` mints to `msg.sender`, reverting if `amount > 200_000e18`.
- No transfer hooks.

**`SquadFactory.sol`**
```solidity
enum Period { Demo, Weekly, Monthly }
struct Record { uint32 onTime; uint32 late; uint32 missed; uint32 completed; }

function createSquad(uint256 contribution, uint8 maxMembers, Period period) external returns (address squad);
// requires contribution >= 100e18, 3 <= maxMembers <= 20. Caller becomes organizer and first member.
mapping(address => bool) public isSquad;
mapping(address => Record) public records;
function trustScore(address user) public view returns (int256); // onTime - 2*late - 10*missed + 3*completed
function tier(address user) public view returns (uint8);         // 0 New (<5), 1 Building (5..19), 2 Reliable (>=20)
function recordContribution(address member, bool late) external; // onlySquad
function recordMiss(address member) external;                     // onlySquad
function recordCompleted(address member) external;                // onlySquad
event SquadCreated(address indexed squad, address indexed organizer, uint256 contribution, uint8 maxMembers, Period period);
```

Period timing (seconds):

| Period | roundLength | grace | depositWindow |
|---|---|---|---|
| Demo | 300 | 60 | 300 |
| Weekly | 604800 | 43200 | 172800 |
| Monthly | 2592000 | 172800 | 259200 |

**`Squad.sol`**: one contract per squad, deployed by the factory.

States: `Open -> Depositing -> Active -> Completed`. `Open | Depositing -> Cancelled`.

| Function | Who | When | Effect |
|---|---|---|---|
| `join()` | anyone not a member | Open, not full | add member |
| `leave()` | member, not the organizer | Open | remove member, no penalty |
| `cancel()` | organizer | Open or Depositing | refund locked deposits, state Cancelled |
| `start()` | organizer | Open, at least 3 members | fix the turn order, compute deposits, state Depositing, `depositDeadline = now + depositWindow` |
| `lockDeposit()` | member | Depositing | pull `requiredDeposit(member) - locked[member]`. When everyone is fully locked, state Active and round 1 starts. |
| `finalizeDeposits()` | anyone | Depositing, after `depositDeadline` | drop members not fully locked (no penalty) and refund what they locked. Under 3 left: Cancelled with refunds. Otherwise keep the remaining members' relative order, recompute deposits, and refund any excess. If anyone now owes more, open a new window; else Active. |
| `contribute()` | member, not stopped paying | Active, current round unpaid by them, `now <= roundDeadline + grace` | pull `contribution`, `factory.recordContribution(member, now > roundDeadline)` |
| `refillDeposit()` | member | Active | pull up to `requiredDeposit(member) - locked[member]` |
| `settleRound()` | anyone | Active, and either all active members paid or `now > roundDeadline + grace` | see the settlement rules below |
| `getState()` | view | any | one struct with everything the UI needs (state, round, deadlines, members[], turns[], paid[], locked[], required[], stoppedPaying[], collectors so far) |

Turn order at `start()`: sort members by `trustScore` descending. Ties are broken by `keccak256(abi.encode(block.prevrandao, address(this), member))` ascending. Insertion sort (n <= 20).

Deposit for the member with turn `p` (1-based) of `n`, contribution `c`:
```
full = c * (n - p)
cap  = tier(member) == Reliable ? 3c : type(uint256).max
requiredDeposit = max(c, min(full, cap))   // floor of c, so even the last turn can cover one miss
```

Settlement rules (`settleRound`, for round `r`, collector = member with turn `r`):
1. For each active member who has not paid in round `r`: a **miss**. Call `factory.recordMiss`. Take `c` from their locked deposit into the jar. If the locked deposit is below `c`, take what is there; the remainder is a shortfall.
2. After a miss, a member must bring `locked` back to `requiredDeposit` (through `refillDeposit`) before the next round's deadline plus grace. If they don't, they are marked **stopped paying** at the next settle.
3. When a member is marked stopped paying:
   - **Not yet collected:** at their turn, `c * roundsRemainingAfterTheirTurn` is withheld from their payout into their locked deposit. Future rounds are then fully covered.
   - **Already collected:** their remaining deposit is spread evenly over the remaining rounds (`floor(locked / roundsRemaining)` per round). The rest of each of those rounds' `c` is a shortfall.
4. Payout = (sum of contributions in round r) + (covered misses) - (shortfalls are simply absent). It is transferred to the collector inside `settleRound`.
5. Set `roundDeadline` for the next round to `roundDeadline + roundLength`. After round `n`, finalize:
   - Refund remaining deposits to members not stopped paying.
   - Split the stopped-paying members' leftover deposits equally among members with zero misses. Dust goes to the collector of turn `n`.
   - Call `factory.recordCompleted` for zero-miss members, only if `n >= 5` and `c >= 1000e18`.
   - Set state Completed.
6. Idempotent: calling twice for the same round reverts with `AlreadySettled`.

Members approve the squad once, for `type(uint256).max`, when they join. Organizer powers end at `start()` except `cancel()` during Depositing.

Events: `Joined`, `Left`, `Started(address[] order)`, `DepositLocked`, `Dropped`, `Activated`, `Contributed(member, round, late)`, `RoundSettled(round, collector, amount, missedMembers[])`, `StoppedPaying(member)`, `Completed`, `Cancelled`.

Invariant (fuzz): `token.balanceOf(squad) == sum(locked) + sum(contributions this round not yet paid out)`, true after every call.

#### 2. App (`app/`, Next.js App Router, TypeScript, Tailwind, viem, `@privy-io/react-auth`)

Routes:

| Route | Purpose |
|---|---|
| `/` | Landing page and login (Privy: email, Google) |
| `/home` | ₦ balance, my squads with the next due date, trust tier badge |
| `/add-money` | Card-style checkout. "Test mode" label. Calls `faucet` with a sponsored tx. |
| `/squads/new` | Kimi text box plus form (contribution, size, period). Deploys through `createSquad`, then `POST /api/squads`. |
| `/s/[slug]` | Join view for non-members. Detail view for members: round timeline, public paid ticks, deposit status, "Remind the squad" button. |
| `/s/[slug]/pay` | One-tap pay page: Pay button only (deep link target from every reminder) |
| `/profile` | Trust score explainer, history, "View receipts" (Monad explorer) under Advanced |

Copy rules: only glossary terms. Banned UI words: wallet, crypto, token, gas, transaction, blockchain, stake, address, default.

Every write uses the Privy embedded wallet with `sponsor: true`. Errors show "Payment didn't go through. Your money is safe." with Retry, after one automatic retry.

#### 3. API and data

Neon Postgres via the Vercel Marketplace:
```sql
create table users (
  privy_id text primary key,
  address text unique not null,
  display_name text not null,
  email text,
  language text not null default 'en' check (language in ('en','pcm','yo','ig','ha')),
  created_at timestamptz not null default now()
);
create table squads (
  address text primary key,
  slug text unique not null,
  name text not null check (char_length(name) between 1 and 40),
  organizer text not null references users(address),
  created_at timestamptz not null default now()
);
create table notifications (
  member text not null,
  squad text not null references squads(address),
  round int not null,
  stage text not null check (stage in ('t24h','t1h','missed')),
  channel text not null check (channel in ('inapp','email')),
  body text not null,
  sent_at timestamptz not null default now(),
  primary key (member, squad, round, stage, channel)
);
```

| Endpoint | Auth | Request | Response |
|---|---|---|---|
| `POST /api/users` | Privy token | `{displayName, language}` | `{ok}` (upsert) |
| `POST /api/squads` | Privy token | `{address, name}` | `{slug}`. Verifies onchain that `isSquad(address)` and the caller is the organizer. |
| `GET /api/squads/[slug]` | public | | `{address, name, memberNames: {address: name}}` |
| `POST /api/kimi/draft` | Privy token | `{text}` | `{draft: {contribution, size, period, name}, followUp?: string, warnings: string[]}` |
| `POST /api/squads/[slug]/remind` | Privy token, member | | `{message, waLink}` |
| `GET /api/notifications` | Privy token | | `[{squad, body, sentAt}]` |
| `GET /api/cron/settle` | header `x-cron-secret` | | settles every Active squad past deadline plus grace, through the Privy server wallet |
| `GET /api/cron/nudge` | header `x-cron-secret` | | sends due nudges (T-24h, T-1h, missed. Demo: T-2m, T-30s, missed), deduplicated by the primary key |

The `/s/[slug]` page also calls `settleRound` through `/api/cron/settle?squad=` when it is viewed after the deadline plus grace.

#### 4. Kimi (OpenAI-compatible chat completions with tools, model ID confirmed on day 7)

- **Draft agent:**
  - Tools: `draftSquad(contribution, size, period, name)` and `lookupTrust(displayName)`.
  - It answers in the user's language and asks at most one follow-up question.
  - It never deploys. The user confirms on the form.
  - On timeout or invalid JSON, return `{draft:null}` and show the plain form.
- **Nudge agent:**
  - Tools: `getSquadState(address)` and `getMemberHistory(address)`.
  - Writes one message per member in their `language`, under 280 characters, with the pay link.
  - On failure, use the English template "Hi {name}, ₦{c} for {squad} is due {when}. Pay: {link}".
- **Remind:** writes a group message in the organizer's language, returned as a `https://wa.me/?text=` link.

## Acceptance Criteria

1. `forge test` passes with at least 25 tests, including the fuzz invariant over 1,000 runs.
2. On Monad testnet, a 3-member Demo squad completes: create, join x2, start, lock deposits x3, 3 rounds paid, 3 payouts. Every member ends with exactly their starting sNGN balance (each paid 3c, received one payout of 3c, and had their deposit refunded), and the squad's balance is 0.
3. A member who skips round 2 after collecting in round 1 has `c` taken from their deposit, and the round 2 collector receives the full `3c`.
4. A Reliable member with a capped deposit who stops paying after collecting causes later payouts to be reduced by exactly the amount computed in settlement rule 3, and the UI names them as "stopped paying".
5. `settleRound` called by a non-member after the deadline plus grace succeeds. Called twice for the same round, it reverts with `AlreadySettled`.
6. The full core flow is completed by a first-time user on a phone without seeing any banned UI word (checked by a grep of rendered copy plus a manual pass).
7. Every user write is sponsored: a new user with 0 MON completes the core flow.
8. Pay from a reminder link: tapping the link to a completed payment takes 2 taps or fewer when already logged in.
9. Kimi draft: "8 of us, 5k every Friday" (English) and the same in Pidgin both produce a draft with contribution 5000, size 8, period Weekly.
10. Nudges are sent at the configured stages and never twice for the same `(member, squad, round, stage, channel)`.
11. A real squad of 5 or more classmates completes at least 3 Demo rounds, with feedback recorded in `docs/user-test.md`.
12. The app is live on a public Vercel URL. The README has judge instructions (login, add money, join the demo squad).

## Testing Plan

| Layer | What | Count |
|---|---|---|
| Unit (Foundry) | faucet cap; create validation; join/leave/cancel; ordering and ties; deposit formula incl. cap and floor; deposit finalize/drop; contribute on time/late/after grace; settle all-paid / deadline / twice; miss from deposit; refill; stopped paying before and after collecting; end split and dust; completed gating; trust math and tiers | +30 |
| Fuzz (Foundry) | random sequences of contribute/settle/refill keep the balance invariant | +1 |
| Integration (Vitest) | `/api/squads` organizer verification; nudge dedup; Kimi fallback on bad JSON | +6 |
| E2E (manual script, two browser profiles plus a phone) | AC 2, 3, 6, 7, 8 | +5 runs |

## Child Issues

| # | Title | Priority | Effort | Depends on |
|---|---|---|---|---|
| 1 | Spike: Privy sponsored tx + server wallet on Monad testnet | Critical | 1h | |
| 2 | Contracts: token, factory, squad, tests, deploy | Critical | 2.5d | |
| 3 | App shell: Privy login, Neon, users, home, add money | Critical | 1d | 1, 2 |
| 4 | Squad flows: create, invite, join, start, deposits, pay, detail | Critical | 1.5d | 3 |
| 5 | Settlement cron + settle on view + relayer | High | 0.5d | 4 |
| 6 | Kimi draft agent, nudges, remind via WhatsApp | High | 1d | 4 |
| 7 | User test with a class squad (Oct 10) | High | 0.5d | 5 |
| 8 | Submission assets: logo, demo video, pitch video, Kimi blog post, README | High | 1d | 7 |

```
#1 Spike ─┐
#2 Contracts ─┴─> #3 Shell ─> #4 Flows ─┬─> #5 Settle ─> #7 User test ─> #8 Submit
                                         └─> #6 Kimi ──────┘
```

Order rationale: the spike first because if sponsorship fails, the app's write path changes. Contracts before the app because the app reads `getState()`. Settlement before the user test because 5-minute rounds need the cron. Kimi is parallel to settlement and can slip without blocking the core demo.

## Rollback Plan

- Contracts are not upgradeable. A bug fix means redeploying the factory and updating `NEXT_PUBLIC_FACTORY` (testnet only, so there are no real funds at risk).
- App: Vercel instant rollback to the previous deployment.
- DB: migrations are additive only.

## Effort Estimate

- Contracts: 2.5d (1d core, 1d tests incl. fuzz, 0.5d deploy and scripts)
- App: 2.5d (1d shell, 1.5d flows)
- Settlement: 0.5d
- Kimi: 1d
- User test: 0.5d
- Assets: 1d
- Total: about 8d, plus about 2d buffer in the 12-day window.

## Files Reference

| File | Change |
|---|---|
| `contracts/src/AjoNGN.sol` | new |
| `contracts/src/SquadFactory.sol` | new |
| `contracts/src/Squad.sol` | new |
| `contracts/test/Squad.t.sol`, `contracts/test/Invariant.t.sol` | new |
| `contracts/script/Deploy.s.sol` | new |
| `app/` (Next.js) | new, routes above |
| `app/lib/chain.ts` | viem client, ABIs, addresses |
| `app/lib/kimi.ts` | Kimi client plus tools |
| `app/db/schema.sql` | SQL above |
| `README.md` | judge instructions |
| `docs/user-test.md` | test notes |

## Out of Scope

- Real naira on-ramp and off-ramp, and Privy card funding (plan B, only after day 8 if everything else passes)
- Monad mainnet
- Web push notifications (days 9-10 only if time allows)
- Circle assistant chat
- Hostel escrow or other jar types
- Phone/SMS login
- Admin dashboard or moderation tools
- Native mobile apps
