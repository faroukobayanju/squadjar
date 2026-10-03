# Squadjar App Wiring Implementation Plan (Plan 2, day 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the demo frontend into the live app: Privy email/Google login with hidden embedded accounts, sponsored writes to the Squad contracts on Monad testnet, Neon for names and slugs, and a relayer that settles and finalizes squads, while keeping the demo adapter as the fallback until the contracts are deployed.

**Architecture:**
- `lib/data.ts` is the only module screens import for data. It picks the live adapter when `NEXT_PUBLIC_FACTORY` is set and the existing demo store (`lib/store.ts`) otherwise. Both expose the same hooks and async actions.
- Live reads: viem `publicClient` polling `Squad.getState()` plus `paid(round, member)` history, mapped to the existing UI `Squad` type by a pure function. The signed-in user's account is mapped to the id `ME` so every screen keeps comparing against `ME`.
- Live writes: Privy `sendTransaction` with gas sponsorship, approve-if-needed before any pull, one automatic retry, receipt wait, and decoded custom errors mapped to friendly copy.
- Server (Next.js route handlers): Privy token verification, Neon for display names, slugs and invite codes, and a private-key relayer that calls `settleRound` / `finalizeDeposits` only after a successful simulation.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, Tailwind v4, `@privy-io/react-auth`, Privy server SDK (exact package fixed in Task 1), `viem`, `@neondatabase/serverless`.

**Spec:** `docs/superpowers/specs/2026-10-02-squadjar-design.md`. Contracts interface: `docs/superpowers/plans/2026-10-02-squadjar-contracts.md` (including the 2026-10-03 `firstDeadline` amendment). Glossary: `CONTEXT.md`. Design: `DESIGN.md`.

## Global Constraints

- Read `app/AGENTS.md`: this Next.js has breaking changes. Check `app/node_modules/next/dist/docs/` before using any Next API (route handlers, `proxy` vs `middleware`, async `params`/`searchParams` read with `use()` in client pages).
- UI copy never shows: wallet, crypto, token, gas, transaction, blockchain, stake, address, default. Privy UI is never shown except Google's own OAuth page: login is headless (`useLoginWithEmail`, `useLoginWithOAuth`), and `embeddedWallets.showWalletUIs` is false.
- Glossary terms only (Squad, Jar, Member, Organizer, Contribution, Round, Payout, Collector, Turn, Deposit, Miss, Late, Stopped paying, Trust score, Tier).
- Visual decisions follow `DESIGN.md` and reuse existing components (`AppShell`, `BackLink`, `StampCard`, `Stamp`, `Countdown`, `SquadList`). Palm `#E4572E` is for money actions only.
- Amounts: sNGN has 18 decimals. UI works in whole naira (`number`); convert with `parseUnits(String(n), 18)` / `Number(formatUnits(x, 18))` only in `lib/live/`.
- Network: Monad testnet, chain id 10143, RPC `https://testnet-rpc.monad.xyz` (viem `monadTestnet` from `viem/chains`).
- Every user write is sponsored (`sponsor: true`); a new user with 0 MON completes the flow.
- Write failures: one automatic retry, then "Payment didn't go through. Your money is safe." with Retry (non-payment writes: "That didn't go through. Try again."). Known contract errors map to specific copy (Task 4).
- No new dependencies beyond `@privy-io/react-auth`, the Privy server SDK, `viem`, `@neondatabase/serverless`.
- Env vars: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_FACTORY`, `NEXT_PUBLIC_TOKEN`, `RELAYER_PRIVATE_KEY`, `CRON_SECRET`. Document all in `app/.env.example`. Never commit `.env.local`.
- Dev server port 3100 (`.claude/launch.json`, name `squadjar-app`).
- Checks follow the repo idiom: `lib/<name>.check.ts`, run with `node lib/<name>.check.ts` (Node 24 strips types), excluded from `tsc` by the existing `lib/*.check.ts` exclude.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A brand-new user with 0 MON and 0 sNGN: login, add money, create, join, lock deposit, pay all succeed with sponsorship (manual E2E after deploy; Task 1 proves one sponsored faucet write).
2. A round that settled early (everyone paid): the next round is not open until the old deadline (`RoundNotOpen`). The pay screen shows "Round N opens in …" and never sends a doomed write (Task 4, check in `lib/chain-map.check.ts`: `roundOpensAt`).
3. Double-tap on Pay or a slow receipt: the button stays busy until the receipt; `AlreadyPaid` maps to "You've already paid this round." (Task 4).
4. Opening an invite link with a wrong or missing code: friendly "This invite link doesn't work. Ask for a fresh one." from `BadInvite`, no crash (Task 4).
5. Missing env (no `NEXT_PUBLIC_FACTORY` or no Privy app id): the app still runs on the demo adapter and `next build` passes (Tasks 1 and 3).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/components/providers.tsx` | Client `PrivyProvider` (skipped when no app id) |
| `app/lib/live/chain.ts` | `publicClient`, addresses, `isLive` |
| `app/lib/live/abi.ts` | Minimal `as const` ABIs for AjoNGN, SquadFactory, Squad, TrustRegistry from the contracts plan |
| `app/lib/live/tx.ts` | `useWrite()`: sponsored send, approve-if-needed, retry, receipt, error decoding |
| `app/lib/errors.ts` | Contract error name → copy |
| `app/lib/auth-server.ts` | Verify Privy token → `{ privyId, address, email }` |
| `app/lib/db.ts` + `app/db/schema.sql` | Neon client and schema |
| `app/app/api/**/route.ts` | users, names, squads, invite, settle, cron |
| `app/lib/types.ts` | UI types moved out of `store.ts` (extended) |
| `app/lib/chain-map.ts` + `.check.ts` | Pure `getState` + history → UI `Squad` |
| `app/lib/live/squads.ts` | Live hooks and actions |
| `app/lib/data.ts` | Facade: live or demo |
| `app/lib/relayer.ts` | Server relayer: simulate then send `settleRound` / `finalizeDeposits` |
| `app/scripts/check-copy.mjs` | Banned-word scan of UI copy |
| `docs/privy-notes.md` | Exact Privy APIs used (from Task 1) |

---

### Task 1: Privy login, sponsored write, chain basics

**Files:**
- Create: `app/components/providers.tsx`, `app/lib/live/chain.ts`, `app/lib/live/abi.ts`, `app/lib/live/tx.ts`, `app/lib/errors.ts`, `app/.env.example`, `docs/privy-notes.md`
- Modify: `app/package.json`, `app/app/layout.tsx`, `app/app/login/page.tsx`, `app/components/shell.tsx`, `app/app/add-money/page.tsx`

**Interfaces:**
- Produces:
  - `isLive: boolean` (true when `NEXT_PUBLIC_FACTORY` and `NEXT_PUBLIC_PRIVY_APP_ID` are both set), `hasPrivy: boolean`
  - `publicClient` (viem, `monadTestnet`), `FACTORY: Address`, `TOKEN: Address`
  - `abi.ts` exports `tokenAbi`, `factoryAbi`, `squadAbi`, `registryAbi` covering exactly the functions, events and errors named in the contracts plan's Interfaces blocks and code (including `createSquad(..., bytes32 inviteHash, uint64 firstDeadline)`, `getState()` returning the `SquadView` tuple in declaration order, `paid(uint256,address)`, `squads(uint256)`, `squadCount()`, `registry()`, `isMember(address)`, `faucet(uint256)`, `approve`, `allowance`, `balanceOf`, events `SquadCreated`, `Contributed`, `RoundSettled`, and every custom error).
  - `useWrite(): { write(call: { address; abi; functionName; args }, opts?: { approve?: { spender: Address; amount: bigint } }): Promise<TransactionReceipt>; busy: boolean }` sending via Privy with `sponsor: true`.
  - `friendlyError(e: unknown, kind: "payment" | "other"): string` in `lib/errors.ts`.
  - `useMyAccount(): { ready: boolean; authenticated: boolean; address?: Address; email?: string; logout(): Promise<void> }`

- [ ] **Step 1: Read the docs, then install.** Fetch current Privy docs (docs.privy.io): React setup, headless email login (`useLoginWithEmail`), headless OAuth (`useLoginWithOAuth`), embedded wallet config (`createOnLogin: "users-without-wallets"`, `showWalletUIs: false`), gas sponsorship (`useSendTransaction` with `sponsor: true` or the current equivalent), and server token verification (pick the currently recommended server package). Record the exact imports, hooks and options in `docs/privy-notes.md` (short, code-first). Then `cd app && npm i @privy-io/react-auth viem <server-package>`.
- [ ] **Step 2: Providers.** `components/providers.tsx` (`"use client"`) wraps children in `PrivyProvider` with `loginMethods: ["email","google"]`, `defaultChain`/`supportedChains: [monadTestnet]`, embedded wallets created on login, wallet UIs hidden. When `NEXT_PUBLIC_PRIVY_APP_ID` is unset it renders children unwrapped. Wrap `{children}` in `app/layout.tsx`.
- [ ] **Step 3: Login.** Keep the current page design. In Privy mode: email field → `sendCode`, then a 6-digit code field → `loginWithCode`; "Continue with Google" → `initOAuth({ provider: "google" })`. After login go to `next` query param if it starts with `/`, else `/home`. Without Privy the existing demo behavior stays. Copy: "We sent a code to {email}." / errors "That code didn't work. Check it and try again."
- [ ] **Step 4: Guard.** In `AppShell`, when `hasPrivy` and Privy is ready and not authenticated, `router.replace("/login?next=" + pathname)`. `/s/[slug]` (invite view) and `/s/[slug]/pay` must also redirect through login when signed out, returning to the same URL including `?code=`.
- [ ] **Step 5: chain.ts, abi.ts, errors.ts, tx.ts.** As in Interfaces. `tx.ts`: if `opts.approve` is given, read `allowance(account, spender)` and send `approve(spender, maxUint256)` first when below `amount`. Send with Privy sponsorship, wait for the receipt via `publicClient.waitForTransactionReceipt`, throw on `status: "reverted"`. Retry the send once on non-revert errors (network). Simulate with `publicClient.simulateContract` before sending so contract errors surface decoded (viem `ContractFunctionRevertedError.data.errorName`). `errors.ts` maps: `AlreadyPaid` → "You've already paid this round.", `PastGrace` → "This round has closed. The jar covered it from your deposit.", `RoundNotOpen` → "This round isn't open yet.", `BadInvite` → "This invite link doesn't work. Ask for a fresh one.", `Full` → "This squad is full.", `AlreadyMember` → "You're already in this squad.", `TooFewMembers` → "You need at least 3 people to start.", `NothingOwed` → "Your deposit is already in.", `MemberStoppedPaying` → "You've been marked as stopped paying in this squad.", `FaucetCapExceeded` → "Test top-ups are capped at ₦200,000 at a time.", `ERC20InsufficientBalance` → "Not enough balance. Add money first.", anything else → the generic payment/other message from Global Constraints.
- [ ] **Step 6: Add money live.** When `isLive`, submit calls `faucet(parseUnits(value, 18))` on `TOKEN` via `useWrite`, and the balance line reads `balanceOf(account)` (poll every 4s). Keep the "Test mode" label and card-style screen. Demo mode unchanged.
- [ ] **Step 7: `.env.example`** lists every env var from Global Constraints with a one-line comment each.
- [ ] **Step 8: Verify.** `npx tsc --noEmit` and `npm run build` pass with no env set (demo mode). If `app/.env.local` has `NEXT_PUBLIC_PRIVY_APP_ID`, start the dev server, sign in with the Privy test account the user configured, and confirm the embedded account exists (log only to the console, never in UI). Report whether a sponsored write could be tested (needs `NEXT_PUBLIC_TOKEN`; skip if contracts not deployed and say so).
- [ ] **Step 9: Commit** `feat(app): Privy headless login, sponsored writes, chain basics`.

---

### Task 2: Neon, server auth, API routes, display name

**Files:**
- Create: `app/db/schema.sql`, `app/lib/db.ts`, `app/lib/auth-server.ts`, `app/lib/slug.ts`, `app/lib/slug.check.ts`, `app/app/api/users/route.ts`, `app/app/api/names/route.ts`, `app/app/api/squads/route.ts`, `app/app/api/squads/[slug]/route.ts`, `app/app/api/squads/[slug]/invite/route.ts`, `app/app/welcome/page.tsx`, `app/scripts/db-migrate.mjs`
- Modify: `app/package.json` (add `@neondatabase/serverless`, script `"db:migrate": "node scripts/db-migrate.mjs"`)

**Interfaces:**
- Consumes: `publicClient`, `factoryAbi`, `squadAbi`, `FACTORY` (Task 1).
- Produces:
  - `sql` tagged template from `lib/db.ts` (`neon(process.env.DATABASE_URL!)`).
  - `requireUser(req: Request): Promise<{ privyId: string; address: Address; email?: string }>` throwing a 401 `Response` when the bearer token is missing/invalid or the user has no embedded account.
  - `slugify(name: string, taken: (s: string) => Promise<boolean>): Promise<string>` (lowercase, non-alphanumerics → `-`, trimmed, `squad` when empty, `-2`, `-3`… on collision).
  - Routes (JSON; client sends `Authorization: Bearer <Privy access token>` from `getAccessToken()`):
    - `POST /api/users` `{ displayName }` (1 to 30 chars after trim) → upsert `{ privyId, address, email, displayName }` → `{ ok: true }`
    - `GET /api/users/me` is NOT added; instead `GET /api/names?a=0x..,0x..` (public) → `{ [lowercaseAddress]: displayName }`
    - `POST /api/squads` `{ address, name, inviteCode }` → verifies `FACTORY.isSquad(address)` and `Squad(address).organizer() == caller.address`, inserts, → `{ slug }`; 403 otherwise
    - `GET /api/squads?a=0x..,0x..` (public) → `{ [lowercaseSquadAddress]: { slug, name } }`
    - `GET /api/squads/[slug]` (public) → `{ address, name }` or 404
    - `GET /api/squads/[slug]/invite` (auth) → `{ code }` only when `Squad.isMember(caller.address)`, else 403
- Schema (`db/schema.sql`, additive, idempotent `create table if not exists`):

```sql
create table if not exists users (
  privy_id text primary key,
  address text unique not null,
  display_name text not null,
  email text,
  language text not null default 'en' check (language in ('en','pcm','yo','ig','ha')),
  created_at timestamptz not null default now()
);
create table if not exists squads (
  address text primary key,
  slug text unique not null,
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null,
  organizer text not null,
  last_poke timestamptz,
  created_at timestamptz not null default now()
);
```

Addresses are stored lowercase.

- [ ] **Step 1: Write `lib/slug.check.ts`** asserting `slugify("CSC 300L Squad", none) === "csc-300l-squad"`, `"!!!"` → `"squad"`, and collision with `csc-300l-squad` taken → `"csc-300l-squad-2"`. Run `node lib/slug.check.ts`: fails (module missing).
- [ ] **Step 2: Implement `lib/slug.ts`**, run the check: prints `slug ok`.
- [ ] **Step 3:** `lib/db.ts`, `scripts/db-migrate.mjs` (reads `db/schema.sql`, runs it against `DATABASE_URL` loaded from `.env.local`), `lib/auth-server.ts` per `docs/privy-notes.md`.
- [ ] **Step 4: Routes** as in Interfaces. Validate inputs (address via viem `isAddress`, name 1 to 40 chars, inviteCode 0x + 64 hex). Read onchain with `publicClient.readContract`.
- [ ] **Step 5: Welcome.** `/welcome`: "What should your squad call you?" single field, saves via `POST /api/users`, then continues to `next`. After login (Task 1 Step 3), live mode goes to `/welcome?next=…` when `GET /api/names?a=<me>` has no entry.
- [ ] **Step 6: Verify.** `node lib/slug.check.ts`, `npx tsc --noEmit`, `npm run build`. If `DATABASE_URL` is present: `npm run db:migrate` and a curl to `GET /api/names?a=0x0000000000000000000000000000000000000000` returns `{}`. Otherwise say it was skipped.
- [ ] **Step 7: Commit** `feat(app): Neon schema, Privy-verified API routes, display names`.

---

### Task 3: Live read model behind one data facade

**Files:**
- Create: `app/lib/types.ts`, `app/lib/chain-map.ts`, `app/lib/chain-map.check.ts`, `app/lib/live/squads.ts`, `app/lib/data.ts`
- Modify: `app/lib/store.ts` (import types from `types.ts`, wrap actions async), every screen and component that imports `@/lib/store` (switch to `@/lib/data`)

**Interfaces:**
- Consumes: Task 1 chain/abi/account, Task 2 routes.
- Produces (`lib/types.ts`, extending today's types; demo seed fills the new fields):

```ts
export type SquadState = "Open" | "Depositing" | "Active" | "Completed" | "Cancelled";
export type Squad = {
  slug: string; address?: `0x${string}`; name: string; contribution: number; period: Period; maxMembers: number;
  members: Member[];            // turn order once started; index 0 collects round 1
  organizerId: string;          // member id (ME when it's me)
  amMember: boolean;
  state: SquadState; currentRound: number;
  roundDeadline: number;        // epoch ms
  roundOpensAt: number;         // epoch ms = roundDeadline - roundLength; contributing earlier reverts RoundNotOpen
  settleableAfter: number;      // epoch ms
  depositDeadline: number;      // epoch ms, 0 when not Depositing
  paid: Record<number, string[]>; missed: Record<number, string[]>;
  stopped: string[];
  myDeposit: number; myRequired: number; myOwed: number;
};
```

  - `toSquad(input: { address; slug; name; view: SquadView; history: Record<number, Address[]>; names: Record<string,string>; tiers: Record<string, Tier>; me: Address; period: Period }): Squad` — pure. Member id = lowercase address, except `me` → `ME`. `missed[r]` for every finished round `r < currentRound` (or `r <= n` when Completed) = members not in `history[r]`. `period` derives from `roundLength` (300 Demo, 604800 Weekly, else Monthly).
  - `data.ts` exports: `isLive`, `ME`, `useSquads(): Squad[] | undefined`, `useSquad(slug): Squad | null | undefined` (undefined = loading, null = not found), `useMe(): { name: string; tier: Tier; score: number; onTime: number; balance: number } | undefined`, `collectorOf`, `payoutAmount`, `myTurn`, `squadBySlug` (unchanged helpers), and `useActions()` returning async `addMoney`, `createSquad`, `join`, `leave`, `start`, `lockDeposit`, `pay`, `refill`, `cancel` (Task 4 fills the live ones; Task 3 wires demo ones and stubs live ones to throw `"Not ready yet"`).
  - Live polling every 4s; `getState` + names + tiers per squad; history via one `multicall` of `paid(r, m)` for all finished rounds × members. My squads = `squadCount()` + `squads(i)` + `isMember(me)` multicall (`// ponytail: scans every squad; index by Membership logs or the DB when squads > ~500`). Slug/name per squad from `GET /api/squads?a=…`.

- [ ] **Step 1: Write `lib/chain-map.check.ts`** with a hand-built `SquadView` for a 3-member Active squad in round 2 (me second in turn order, member 3 unpaid in round 1, `roundLength` 300, `roundDeadline` 1_000_000s) and assert: my id is `ME`; `period` is `"Demo"`; `missed[1]` holds member 3's lowercase address; `roundOpensAt` is `(1_000_000 - 300) * 1000`; `myDeposit`/`myRequired` convert from 18 decimals. Run it: fails (module missing).
- [ ] **Step 2: Implement `types.ts` and `chain-map.ts`**; run the check: prints `chain-map ok`.
- [ ] **Step 3: `live/squads.ts` and `data.ts`.** Demo branch: re-export the store's hooks, make actions async wrappers, add the new fields in `seed()` (organizer = first member, `amMember: true`, `roundOpensAt = roundDeadline - PERIOD_MS[period]`, `stopped: []`, `myRequired = myDeposit`, `myOwed: 0`, `depositDeadline: 0`, `settleableAfter = roundDeadline + grace`). Bump the storage key to `squadjar-demo-v2`.
- [ ] **Step 4: Switch every screen to `@/lib/data`**, handling `undefined` (loading) with a skeleton that matches the final layout (no spinner) and `null` with the existing not-found copy. No visual change in demo mode.
- [ ] **Step 5: Verify.** `node lib/chain-map.check.ts`, `node lib/draft.check.ts`, `npx tsc --noEmit`, `npm run build`. Start the dev server without `NEXT_PUBLIC_FACTORY` and click through `/home`, `/s/csc-300l`, `/s/csc-300l/pay`, `/profile`: identical to before.
- [ ] **Step 6: Commit** `feat(app): live read model behind a data facade, demo kept as fallback`.

---

### Task 4: Live write flows and the missing squad states

**Files:**
- Modify: `app/lib/live/squads.ts`, `app/app/squads/new/page.tsx`, `app/app/s/[slug]/page.tsx`, `app/app/s/[slug]/pay/page.tsx`, `app/app/s/[slug]/payout/page.tsx`, `app/app/profile/page.tsx`, `app/app/home/page.tsx`, `app/components/squad-list.tsx`
- Create: `app/lib/due.ts`, `app/lib/due.check.ts`, `app/scripts/check-copy.mjs`; Modify `app/package.json` (script `"check:copy": "node scripts/check-copy.mjs"`)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `nextDue(period: Period, pick: { weekday?: number; monthDay?: number; hour: number }, now: Date): number` (epoch seconds) in `lib/due.ts`. Weekly: next `weekday` at `hour:00` local time at least 24h after `now`. Monthly: next `monthDay` (1 to 28) at `hour:00` at least 24h after `now`. Demo: 0.
  - Live actions:
    - `createSquad({ name, contribution, size, period, due })` → random 32-byte `code`, `inviteHash = keccak256(encodeAbiParameters([{ type: "bytes32" }], [code]))`, `createSquad(c, size, periodIndex, inviteHash, nextDue(...))`, squad address from the `SquadCreated` log, `approve(squad, maxUint256)`, `POST /api/squads`, returns slug.
    - `join(slug, code)` → write `join(code)` with `approve: { spender: squad, amount: maxUint256 }`.
    - `start(slug)`, `leave(slug)`, `cancel(slug)`, `lockDeposit(slug)`, `refill(slug)`.
    - `pay(slug)` → `contribute()`; parse the receipt's `RoundSettled` log; when its collector is me, return `{ settled: true, payout: { slug, squadName, round, amount, covered, at } }` where `covered = amount - paidThisRound * c` floored at 0. Store the payout for `/s/[slug]/payout` (module state or sessionStorage).
  - Invite link: `${origin}/s/${slug}?code=${code}` (organizer and members fetch `code` from `GET /api/squads/[slug]/invite`).

- [ ] **Step 1: Write `lib/due.check.ts`**: from Wed 2026-10-07 10:00 local, Weekly Friday 18 → Fri 2026-10-09 18:00; from Thu 2026-10-08 20:00, Weekly Friday 18 → Fri 2026-10-16 18:00 (less than 24h away rolls a week); Monthly day 25 at 9 from 2026-10-03 → 2026-10-25 09:00; Demo → 0. Run: fails. Implement `lib/due.ts`. Run: `due ok`.
- [ ] **Step 2: Create screen.** Add "Due day" under period: Weekly → weekday chips (Mon to Sun) + time select; Monthly → day 1 to 28 + time; Demo → hidden. Default Friday 18:00 / day 25 09:00. Kimi's text box stays (pattern parser now); when the text says a weekday, preselect it.
- [ ] **Step 3: `/s/[slug]` states** (one view each, existing visual language):
  - Not a member + Open: squad name, amount, period, seats left, "Join squad" (needs `?code`; without it show the `BadInvite` copy). Not a member + other states: "This squad has already started."
  - Open, member: today's view; organizer gets "Start squad" when ≥3 members (confirm sheet: "Turns get fixed now. Everyone then has {window} to lock their deposit."); non-organizer gets "Leave squad"; organizer gets "Cancel squad" (secondary).
  - Depositing: turn order with each member's deposit status (locked / waiting), my required deposit, deadline countdown, "Lock ₦X deposit" (palm) or "Deposit in" stamp; organizer "Cancel squad".
  - Active: today's view plus: "Round N opens in …" when `now < roundOpensAt`; refill banner when `myDeposit < myRequired` ("Top up your deposit by ₦X before {date} to stay in good standing"); members in `stopped` labelled "Stopped paying".
  - Completed: deposits returned summary. Cancelled: "This squad was cancelled. Deposits were returned."
- [ ] **Step 4: Pay page** uses live `pay`; before Round open shows the opens-in state instead of the button; button busy until receipt; errors through `friendlyError(e, "payment")` with Retry.
- [ ] **Step 5: Profile** shows live trust score and tier from the registry (`registry()` on the factory, then `trustScore`, `tier`, `records`), and a line: "Quick demo squads don't count toward your trust score."
- [ ] **Step 6: `scripts/check-copy.mjs`**: scan `app/**/page.tsx` and `components/**/*.tsx` for JSX text and string literals containing the banned words (case-insensitive, whole word), print `file:line word`, exit 1 if any. Run `npm run check:copy`: passes.
- [ ] **Step 7: Verify.** `node lib/due.check.ts`, all other checks, `npx tsc --noEmit`, `npm run build`, `npm run check:copy`. Demo mode click-through still works. Live E2E is deferred until contracts deploy; say so in the report.
- [ ] **Step 8: Commit** `feat(app): live create, join, start, deposit, pay, refill and squad states`.

---

### Task 5: Relayer, settle-on-view, cron

**Files:**
- Create: `app/lib/relayer.ts`, `app/app/api/settle/route.ts`, `app/app/api/cron/settle/route.ts`
- Modify: `app/app/s/[slug]/page.tsx` (poke on view), `app/.env.example`

**Interfaces:**
- Consumes: Tasks 1 to 3, `squads.last_poke`.
- Produces:
  - Relayer signer: prefer a Privy server wallet with a policy allowing only `settleRound` and `finalizeDeposits` (see `docs/privy-security-notes.md`; check docs.privy.io for whether a policy can match calls to any squad created by `FACTORY`). If policies can't express that, or setup needs dashboard work the user hasn't done, fall back to `RELAYER_PRIVATE_KEY` with a viem wallet client and note it in the report.
  - `poke(squad: Address): Promise<"settled" | "finalized" | "nothing">` in `lib/relayer.ts`: reads `getState()`; if Active and (`now > settleableAfter` or every active member paid) → simulate `settleRound(currentRound)`, send if the simulation succeeds; if Depositing and `now > depositDeadline` → simulate `finalizeDeposits()`, send if OK; else `"nothing"`. Uses `RELAYER_PRIVATE_KEY` with a viem wallet client. Never sends a write whose simulation reverted. Explicit gas limit = simulated estimate × 1.2 (Monad charges the gas limit).
  - `POST /api/settle` `{ squad }` (public): 429 when `last_poke` is under 15 s ago (update `last_poke` before sending), else `poke`.
  - `GET /api/cron/settle` with header `x-cron-secret: $CRON_SECRET` (401 otherwise): every squad from `squadCount()`/`squads(i)`, `poke` sequentially, returns `{ settled, finalized }` counts.
- [ ] **Step 1:** Implement `relayer.ts` and both routes.
- [ ] **Step 2:** `/s/[slug]` calls `POST /api/settle` once when it sees `now > settleableAfter` (Active) or `now > depositDeadline` (Depositing), then lets polling pick up the change.
- [ ] **Step 3: Verify.** `npx tsc --noEmit`, `npm run build`; `curl -i localhost:3100/api/cron/settle` → 401 without the header. With no `RELAYER_PRIVATE_KEY`, `/api/settle` returns 503 `{ error: "relayer not configured" }` rather than crashing.
- [ ] **Step 4: Commit** `feat(app): relayer settles and finalizes squads after simulation`.

---

## After this plan

- Live E2E (spec AC 2, 3, 6, 7, 8) once the contracts are deployed: set `NEXT_PUBLIC_FACTORY`/`NEXT_PUBLIC_TOKEN` from `contracts/deployments/10143.json`, fund the relayer with testnet MON, point cron-job.org at `/api/cron/settle` every minute.
- Day 6: Kimi draft and nudges (spec §4). Day 8: README judge instructions, demo seed script.
