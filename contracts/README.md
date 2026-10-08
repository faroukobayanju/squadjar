# Squadjar contracts

Rotating savings (ajo) where no member holds the jar. Foundry, Solidity 0.8.24.

## Commands

| Task | Command |
|---|---|
| Test | `forge test` |
| Local deploy | `anvil --silent &` then `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` |
| Testnet deploy | `forge script script/Deploy.s.sol --rpc-url monad_testnet --account <keystore> --sender <address> --broadcast` (Foundry keystore; prompts for its password) |
| Redeploy only the factory | `TOKEN=<token address> REGISTRY=<registry address> forge script script/Deploy.s.sol --rpc-url monad_testnet --account <keystore> --sender <registry owner> --broadcast` |
| Verify a contract | `forge verify-contract <address> src/<File>.sol:<Contract> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` (add `--constructor-args` for TrustRegistry and SquadFactory; keep the trailing `/`, Forge appends `v2/verify` to it) |
| Export ABIs | `script/export-abi.sh` |

`TOKEN` and `REGISTRY` are optional. With `REGISTRY` set, the deployer must be the registry owner, because the script allowlists the new factory with `setWriter`.

Addresses: `deployments/<chainId>.json` (10143 = Monad testnet, 31337 = local anvil).

### Monad testnet deployment (2026-10-07, no deposit)

| Contract | Address |
|---|---|
| AjoNGN (sNGN) | `0xb7A57BeF0DD01A96C7626fDD6F143C9127d110C9` |
| TrustRegistry | `0xe80e9A23B647CD653F3A5ef16222aD6794C23eCB` |
| SquadFactory | `0x7bBADfC407b7eC8941B7A72A4820Ae946dF48Ef2` |

The no-deposit factory was deployed on 2026-10-07 in block 69087050 (`deployBlock` in the JSON) with `TOKEN` and `REGISTRY` set, so the token and registry are unchanged and trust history carries over. The registry allows it as a writer (`isWriter` is true). It is verified on Sourcify (exact match).

The token is from the first deployment (blocks 68377315 to 68377316). The registry was redeployed on 2026-10-05 in blocks 68461404 to 68461405, after the fix that stops a factory revocation from freezing squads. Token and registry are verified on Sourcify (exact match). Registry owner and deployer: `0xfAc4f942A7c8232c7a7D8b654F8580e00a368dF6`. Consecutive blocks have different `mixHash` values, so `block.prevrandao` varies on Monad testnet.

Superseded factories, still on chain (each is still a writer on its own registry):

| Factory | Registry | Deploy block | Model |
|---|---|---|---|
| `0x7B2aC330515073De9aCB8883ee0AAA8cE11B5d4B` | `0xe80e9A23B647CD653F3A5ef16222aD6794C23eCB` | 68461309 (simulation block, a safe lower bound) | Deposits |
| `0x2bf6b051e25E3Aa65AE55D8367500BBcBA50fdf5` | `0x43fC7e538D865A9eaf3c634888E61c8d3D16f7f7` | 68377230 | Deposits |

Squads created by an old factory keep working on chain with the old ABI, but the app reads only the factory in `NEXT_PUBLIC_FACTORY`.

## Squad lifecycle

```
Open --start (organizer, >=3)--> Active --round n settled--> Completed
Open --cancel (organizer)--> Cancelled
```

There is no deposit. `State` keeps the value `Depositing` (1) so the numbers do not shift, but a squad never enters it.

| Function | Caller | State |
|---|---|---|
| `join(code)` / `joinWithPermit(code, deadline, v, r, s)` | anyone with the invite code | Open |
| `leave()` | member, not organizer | Open |
| `remove(address)` | organizer | Open |
| `start()` | organizer | Open |
| `cancel()` | organizer | Open |
| `contribute()` | member | Active |
| `settleRound(round)` | anyone; after `settleableAfter()`, or at once when every member has paid (the last `contribute` does this itself) | Active |
| `payBack()` | member with debt | Active or Completed |
| `getState()` | view | any |

`start()` sorts members into turn order by trust score, fixes each member's allowance from their tier, and starts round 1.

`settleRound` is the cron path for rounds where someone has not paid. When every member has paid, the last `contribute()` settles the round automatically in the same transaction, so a manual `settleRound` for that round then reverts `AlreadySettled`.

`remove(address)` lets the organizer drop a member while the squad is Open, for example a stranger who used a leaked invite code. The organizer cannot be removed. A removed member can rejoin with the same invite code.

`cancel()` ends the squad while it is Open. The jar holds no money before `start()`, so nothing is refunded.

Invite hash (viem): `keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]))`, where `code` is a random 32 bytes carried in the invite link. The code is visible onchain after the first join, so invite-only stops casual joins, not determined ones.

Invite codes never expire. The only way to stop one is for the organizer to `remove` the member or `cancel` the squad.

Enums in the ABI: `Period` 0 Demo, 1 Weekly, 2 Monthly. `State` 0 Open, 1 Depositing (unused), 2 Active, 3 Completed, 4 Cancelled. `tier()` 0 New, 1 Building, 2 Reliable.

### Joining with a permit

`joinWithPermit(code, deadline, v, r, s)` needs a permit signed for `value = type(uint256).max` and `spender = the squad address` (the owner is the caller). A permit for any other value, spender or deadline fails silently: the join still succeeds, and `contribute` later reverts `ERC20InsufficientAllowance`. If the app cannot sign exactly that permit, send a normal `approve` instead.

## Creating a squad

`SquadFactory.createSquad(contribution, maxMembers, period, inviteHash, firstDeadline)`

- `contribution`: per-round amount in ₦ (18 decimals), at least ₦100.
- `maxMembers`: 3 to 20.
- `period`: `Period` ordinal (0 Demo, 1 Weekly, 2 Monthly). `timing(period)` returns `(roundLength, grace)`.
- `inviteHash`: non-zero, see the invite hash recipe above.
- `firstDeadline`: anchors the round 1 deadline.
  - `0` means one `roundLength` after `start()`.
  - A nonzero value anchors round 1 to a chosen weekday and time. It must be in the future and no more than 60 days out.
  - If `start()` runs past it, the deadline rolls forward by whole rounds.
  - Round 1 always gets at least half a round. If the anchor is less than half a round away at start, round 1 is pushed one more round.
  - Round r+1's deadline is the previous deadline plus one `roundLength`. Weekly rounds are exactly 7 days apart, so they keep the same weekday and time. Monthly rounds are a fixed 30 days apart and drift against calendar months.
  - After a late settle the next deadline rolls forward by whole rounds until it is in the future, and gets one more round if it would be less than half a round away. This never happens on an on-time settle. The weekday and time stay aligned to the anchor.
- `firstDeadline()` is a public getter and is not in `getState()`. The exact round 1 deadline is final at `start()` (`Activated(roundDeadline)` or `getState().roundDeadline`).

## Held money, debt and paying back

**Held money.** When a member collects in round r of an n-member squad, they still owe `(n − r)` contributions. Part of that is held back from their payout:

`held = (n − r) · c · (100 − allowance) / 100`, capped at what is left of the payout.

| Tier at start | Allowance | Share of the remaining contributions held |
|---|---|---|
| New | 0% | 100% |
| Building | 25% | 75% |
| Reliable | 50% | 50% |

The held money sits in `locked[member]`, covers that member's own later misses, and is returned in full at the end. The allowance is fixed at `start()`; a tier change mid-squad does not change it. The last turn holds nothing.

**Misses.** When a member misses a round:

1. Their own held money covers it, if they have any.
2. Whatever is left becomes debt: `owed[misser]` and `credit[collector]` both go up by that amount, and the collector is paid that much less for now.
3. A collector who misses their own round gets a smaller payout and no debt is recorded.

Nobody else's held money ever covers another member's miss.

**Paying back.** Debt is cleared in two ways, and the money always goes straight to members with credit, in turn order:

- `payBack()` pays the member's whole debt at once. It works while Active and after Completed.
- When a member with debt collects, the debt is taken from their payout first, before anything is held.

`Σ owed == Σ credit` at all times. A member never has both debt and held money at the end, so `_finish` only returns held money. Debts still open at the end stay open for `payBack()`.

**Accepted risk.** A Building or Reliable member who collects early and then stops paying leaves part of what they owe unbacked. The later collectors keep that as credit and are made whole only if that member pays back. Squads are invite-only for this reason.

In a trust-counting squad, every miss is recorded in the registry, and a member with zero misses gets `completed` at the end. Paying back does not undo a recorded miss.

## Replacing a factory

1. Deploy a new factory (`TOKEN` and `REGISTRY` set, see Commands). The script allowlists it with `registry.setWriter(newFactory, true)`.
2. Keep the old factory allowlisted, so its squads keep recording trust.
3. The app reads new squads from the new factory. Squads from an old factory keep working on chain with the old ABI. `deployments/<chainId>.json` holds one factory, so keep a list of old factories with their deploy blocks, or have the app index the registry's `SquadRegistered(factory, squad)` events.

The registry keeps all trust history, so existing records survive a new factory.

Revoking an old factory with `registry.setWriter(old, false)` is safe for money at any time. Its squads keep paying, settling and finishing. From then on, though, its squads record no trust at all until the factory is allowed again (the registry skips writes from squads whose factory is not allowed, it never reverts them). Demo squads never write trust and are unaffected.

## Reading squad state in the app

- `getState()` returns, per member in turn order: `locked` (held money), `allowance` (0, 25 or 50), `paidThisRound`, `misses`, `owed` (debt) and `credit`. Before Active, `currentRound` and `roundDeadline` are 0 and `settleableAfter` equals `grace`. After Completed, `paidThisRound` still shows the last round. Read `state` first.
- `RoundSettled(round, collector, amount, missed)`: `amount` is what the collector actually received, net of their own debt repaid and the amount held. `missed[]` lists every member who did not pay that round; use it for the "someone missed" notification.
- `PayoutHeld(member, round, amount)`: show "₦X now · ₦Y waits in the jar", where X is the `RoundSettled` amount and Y is this amount.
- `CreditPaid(member, amount)`: a short-paid collector received money back. `PaidBack(member, amount)`: a member cleared their debt.
- `payBack()` pulls `owed[member]` with `transferFrom`, so it needs the same allowance as `contribute()`.
- Returning held money at the end has no event of its own. Use the token's `Transfer` logs or the `locked` change in `getState()`.
- `factory.isSquad(x)` covers only that factory. To tell whether any address is a Squadjar squad across factories, use `registry.factoryOf(x) != address(0)`. `registry.isSquad(x)` is true only while its factory is still allowed to write.
- `cancel()` emits `Cancelled` and does not emit `Membership(false)` for members.

## Error catalogue

| Error | Cause | What the user should do |
|---|---|---|
| `ContributionTooLow(min)` | Contribution under ₦100 | Pick at least ₦100 |
| `SizeOutOfRange(min, max)` | Squad size outside 3 to 20 | Pick 3 to 20 people |
| `EmptyInvite()` | App sent no invite hash | App bug: generate a code |
| `DeadlineInPast()` | `firstDeadline` is set but not in the future | Pick a future time, or 0 |
| `DeadlineTooFar()` | `firstDeadline` is more than 60 days out | Pick a date within 60 days |
| `BadInvite()` | Wrong invite code (codes never expire) | Check the link, or ask the organizer to resend it |
| `Full()` | Squad already has its max members | Ask the organizer to start a new squad |
| `AlreadyMember()` | Joining twice | Open the squad instead |
| `OrganizerCannotLeave()` | Organizer called `leave()`, or the organizer was passed to `remove(address)` | Cancel the squad instead |
| `NotOrganizer()` | Non-organizer tried start/cancel/remove | Only the organizer can do this |
| `NotMember()` | Caller isn't in the squad | Join first |
| `WrongState(current)` | Action not allowed in this phase | Refresh; show what the squad is waiting for |
| `TooFewMembers()` | Start with under 3 members | Invite more people |
| `NothingOwed()` | `payBack()` with no debt | Nothing to do |
| `AlreadyPaid()` | Paying twice in one round | Nothing to do |
| `PastGrace()` | Paying after deadline + grace | The round is closed. After it settles, the miss is debt: use `payBack()` |
| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |
| `RoundNotOpen(opensAt)` | Paying for a round before it opens | Wait until `opensAt` |
| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |
| `FaucetCapExceeded()` | Top-up over ₦200,000 in one call | Top up in smaller amounts |
| `NotWriter()` | `createSquad` on a factory the registry does not allow | Deployment bug: allow the factory with `registry.setWriter` |
| `NotSquad()` (`SquadFactory`) | `join`, `leave` or `remove` where the factory does not know the squad | Deployment bug |
| `OwnableUnauthorizedAccount(address)` | Non-owner called a registry admin function | Use the registry owner account |
| `ERC20InsufficientAllowance(...)` | Member hasn't approved the squad to pull ₦, or the `joinWithPermit` permit was wrong (see Joining with a permit) | App approves the squad, then retries |
| `ERC20InsufficientBalance(...)` | Member doesn't have enough ₦ | Top up, then retry |

Only `SquadFactory` throws `NotSquad()`. `TrustRegistry` still declares it for ABI compatibility but never throws it: members never see it on `contribute` or `settleRound`, even while a factory is revoked.

Errors from the token and the registry bubble up through `Squad` calls. To decode them, merge the ABIs `Squad` + `AjoNGN` + `TrustRegistry` (add `SquadFactory` for calls made to the factory).
