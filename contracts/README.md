# Squadjar contracts

Rotating savings (ajo) where no member holds the jar. Foundry, Solidity 0.8.24.

## Commands

| Task | Command |
|---|---|
| Test | `forge test` |
| Local deploy | `anvil --silent &` then `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` |
| Testnet deploy | `source .env && forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast` |
| Export ABIs | `script/export-abi.sh` |

Addresses: `deployments/<chainId>.json` (10143 = Monad testnet, 31337 = local anvil).

## Squad lifecycle

```
Open --start (organizer, >=3)--> Depositing --all deposits locked--> Active --round n settled--> Completed
Open | Depositing --cancel (organizer, still a member) or <3 left after finalize--> Cancelled
```

| Function | Caller | State |
|---|---|---|
| `join(code)` / `joinWithPermit(code, deadline, v, r, s)` | anyone with the invite code | Open |
| `leave()` | member, not organizer | Open |
| `remove(address)` | organizer | Open |
| `start()` | organizer | Open |
| `cancel()` | organizer | Open or Depositing |
| `lockDeposit()` | member | Depositing |
| `finalizeDeposits()` | anyone, after `depositDeadline` | Depositing |
| `contribute()` / `refillDeposit()` | member | Active |
| `settleRound(round)` | anyone; after `settleableAfter()` | Active |
| `getState()` | view | any |

`settleRound` is the cron path for rounds where someone has not paid. When every active member has paid, the last `contribute()` settles the round automatically in the same transaction, so a manual `settleRound` for that round then reverts `AlreadySettled`.

`remove(address)` lets the organizer drop a member while the squad is Open, for example a stranger who used a leaked invite code. The organizer cannot be removed. A removed member can rejoin with the same invite code.

`cancel()` ends the squad while it is Open or Depositing and refunds every locked deposit. Only an organizer who is still a member can call it.

Invite hash (viem): `keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]))`, where `code` is a random 32 bytes carried in the invite link. The code is visible onchain after the first join, so invite-only stops casual joins, not determined ones.

Invite codes never expire. The only way to stop one is for the organizer to `remove` the member or `cancel` the squad.

Enums in the ABI: `Period` 0 Demo, 1 Weekly, 2 Monthly. `State` 0 Open, 1 Depositing, 2 Active, 3 Completed, 4 Cancelled. `tier()` 0 New, 1 Building, 2 Reliable.

### Joining with a permit

`joinWithPermit(code, deadline, v, r, s)` needs a permit signed for `value = type(uint256).max` and `spender = the squad address` (the owner is the caller). A permit for any other value, spender or deadline fails silently: the join still succeeds, and `lockDeposit` later reverts `ERC20InsufficientAllowance`. If the app cannot sign exactly that permit, send a normal `approve` instead.

## Creating a squad

`SquadFactory.createSquad(contribution, maxMembers, period, inviteHash, firstDeadline)`

- `contribution`: per-round amount in ₦ (18 decimals), at least ₦100.
- `maxMembers`: 3 to 20.
- `period`: `Period` ordinal (0 Demo, 1 Weekly, 2 Monthly).
- `inviteHash`: non-zero, see the invite hash recipe above.
- `firstDeadline`: anchors the round 1 deadline.
  - `0` means one `roundLength` after the squad activates.
  - A nonzero value anchors round 1 to a chosen weekday and time. It must be in the future and no more than 60 days out.
  - If activation runs past it, the deadline rolls forward by whole rounds.
  - Round 1 always gets at least half a round. If the anchor is less than half a round away at activation, round 1 is pushed one more round.
  - Round r+1's deadline is the previous deadline plus one `roundLength`. Weekly rounds are exactly 7 days apart, so they keep the same weekday and time. Monthly rounds are a fixed 30 days apart and drift against calendar months.
  - After a late settle the next deadline rolls forward by whole rounds until it is in the future, and gets one more round if it would be less than half a round away. This never happens on an on-time settle. The weekday and time stay aligned to the anchor.
- `firstDeadline()` is a public getter and is not in `getState()`. The app must read it and show round 1's date before members lock deposits: the deposits sit idle until the squad activates, up to 60 days plus the deposit window. The exact round 1 deadline is final only at activation (`Activated(roundDeadline)` or `getState().roundDeadline`). `depositWindow()` is a getter too, and `depositDeadline` in `getState()` is set at `start()`.

## Settlement and forfeits

A member is marked stopped paying on a second miss while a deposit refill from the first one is still owed. They pay no more contributions. Their missed rounds are covered from their deposit. If their turn has not passed yet, any shortfall is fronted from the jar's free money and repaid from their payout.

At the end of the last round, deposits of members who stopped paying are forfeited into a pool. The pool is the jar balance left after refunding every deposit of a member still paying, net of any unrepaid fronting. It is paid out like this:

- If at least one member still paying has zero misses, the zero-miss members share it equally, and the remainder (dust, under the number of sharers) goes to the last member still paying in turn order.
- If members are still paying but none has zero misses, all of them share it equally, and the dust goes to the last of them in turn order.
- If nobody is still paying, the whole balance goes to the member with the last turn.
- If unrepaid fronting left the jar short, refunds are cut pro rata and the pool is zero. Rounding leftovers still go to the last member still paying. The final settle never reverts.

In a trust-counting squad, only a member still paying with zero misses gets `completed` in the registry.

## Replacing a factory

1. Deploy a new factory.
2. Allow it in the registry: `registry.setWriter(newFactory, true)`.
3. Keep the old factory's address. The app must keep reading its squads (its `Membership` events, `squads` list and `isSquad`) and only the new factory gets new squads. `deployments/<chainId>.json` holds one factory, so keep a list of old factories with their deploy blocks, or have the app index the registry's `SquadRegistered(factory, squad)` events.

The registry keeps all trust history, so existing records survive a new factory.

Revoking an old factory with `registry.setWriter(old, false)` pauses its trust-counting squads (Weekly or Monthly, 5 or more members, contribution of ₦1,000 or more): `contribute` and `settleRound` revert with the registry's `NotSquad()`, and deadlines keep moving. After the factory is re-allowed, every member who could not pay is recorded as a miss. Re-allow the factory to unpause them. Only revoke an old factory after those squads finish. Demo squads never write trust and are unaffected.

## Reading squad state in the app

- Gate `turnOf(x)`, `required(x)` and `cappedAtStart(x)` on `isMember(x)`. They keep stale values for members dropped at `finalizeDeposits`.
- `getState()` fields are not cleaned up at the edges. Before Active, `currentRound` and `roundDeadline` are 0 and `settleableAfter` equals `grace`. After Completed, `owed`, `refillBy` and `paidThisRound` still show the last round's values. Read `state` first.
- `RoundSettled.amount` is what the collector actually received: net of the fronting they repaid and any amount withheld into their deposit. `missed[]` lists every member who did not pay that round, including members who stopped paying, in every remaining round.
- `missCount` does not include the miss on which a member is marked stopped paying, but the trust record does: the first miss and the stopping miss are each one `missed`. A member who stops after one earlier miss shows `missCount == 1` and `registry.records(m).missed == 2` in a trust-counting squad.
- `factory.isSquad(x)` covers only that factory. To tell whether any address is a Squadjar squad across factories, use `registry.factoryOf(x) != address(0)`. `registry.isSquad(x)` is true only while its factory is still allowed to write.
- Covers, fronting, refunds at finish and forfeit shares have no events of their own. Rebuild "taken from your deposit" or "returned" from `getState` changes or the token's `Transfer` logs. `cancel()` emits `Cancelled` and does not emit `Membership(false)` for members.

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
| `NotOrganizer()` | Non-organizer (or dropped organizer) tried start/cancel/remove | Only the organizer can do this |
| `NotMember()` | Caller isn't in the squad | Join first |
| `WrongState(current)` | Action not allowed in this phase | Refresh; show what the squad is waiting for |
| `TooFewMembers()` | Start with under 3 members | Invite more people |
| `NothingOwed()` | Deposit already fully locked | Nothing to do |
| `DepositWindowOpen()` | Finalize before the window closed | Wait for the deadline |
| `AlreadyPaid()` | Paying twice in one round | Nothing to do |
| `PastGrace()` | Paying after deadline + grace | The round is closed. Wait for it to settle (cron or anyone), which covers the miss from the deposit, then `refillDeposit()`; before the settle it reverts `NothingOwed` |
| `MemberStoppedPaying()` | Member marked stopped paying | No more payments accepted from this member |
| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |
| `RoundNotOpen(opensAt)` | Paying for a round before it opens | Wait until `opensAt` |
| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |
| `FaucetCapExceeded()` | Top-up over ₦200,000 in one call | Top up in smaller amounts |
| `NotWriter()` | `createSquad` on a factory the registry does not allow | Deployment bug: allow the factory with `registry.setWriter` |
| `NotSquad()` (`TrustRegistry`) | `contribute` or `settleRound` on a trust-counting squad whose factory is no longer allowed | The squad is paused. Tell members it resumes when the factory is re-allowed |
| `NotSquad()` (`SquadFactory`) | `join`, `leave`, `remove` or `finalizeDeposits` where the factory does not know the squad | Deployment bug |
| `OwnableUnauthorizedAccount(address)` | Non-owner called a registry admin function | Use the registry owner account |
| `ERC20InsufficientAllowance(...)` | Member hasn't approved the squad to pull ₦, or the `joinWithPermit` permit was wrong (see Joining with a permit) | App approves the squad, then retries |
| `ERC20InsufficientBalance(...)` | Member doesn't have enough ₦ | Top up, then retry |

The two `NotSquad()` errors have the same selector, so the app cannot tell them apart from the error alone. Tell them apart by which call reverted: `contribute` and `settleRound` raise the registry's, and `join`, `leave`, `remove` and `finalizeDeposits` raise the factory's. Members see the registry one while a factory is revoked.

Errors from the token and the registry bubble up through `Squad` calls. To decode them, merge the ABIs `Squad` + `AjoNGN` + `TrustRegistry` (add `SquadFactory` for calls made to the factory).
