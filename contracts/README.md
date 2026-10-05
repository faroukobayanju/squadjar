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
| `settleRound(round)` | anyone; after `settleableAfter()` or once all have paid | Active |
| `getState()` | view | any |

`remove(address)` lets the organizer drop a member while the squad is Open, for example a stranger who used a leaked invite code. The organizer cannot be removed.

`cancel()` ends the squad while it is Open or Depositing and refunds every locked deposit. Only an organizer who is still a member can call it.

Invite hash (viem): `keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]))`, where `code` is a random 32 bytes carried in the invite link. The code is visible onchain after the first join, so invite-only stops casual joins, not determined ones.

Enums in the ABI: `Period` 0 Demo, 1 Weekly, 2 Monthly. `State` 0 Open, 1 Depositing, 2 Active, 3 Completed, 4 Cancelled. `tier()` 0 New, 1 Building, 2 Reliable.

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
  - Round 1 always gets at least half a round.
  - Later rounds keep the same weekday and time, also after a late settle.

## Replacing a factory

1. Deploy a new factory.
2. Allow it in the registry: `registry.setWriter(newFactory, true)`.

The registry keeps all trust history, so existing records survive a new factory.

Revoking an old factory with `registry.setWriter(old, false)` pauses its trust-counting squads (Weekly or Monthly, 5 or more members, contribution of ₦1,000 or more), because their trust writes revert. Re-allow the factory to unpause them. Only revoke an old factory after those squads finish. Demo squads never write trust and are unaffected.

## Error catalogue

| Error | Cause | What the user should do |
|---|---|---|
| `ContributionTooLow(min)` | Contribution under ₦100 | Pick at least ₦100 |
| `SizeOutOfRange(min, max)` | Squad size outside 3 to 20 | Pick 3 to 20 people |
| `EmptyInvite()` | App sent no invite hash | App bug: generate a code |
| `DeadlineInPast()` | `firstDeadline` is set but not in the future | Pick a future time, or 0 |
| `DeadlineTooFar()` | `firstDeadline` is more than 60 days out | Pick a date within 60 days |
| `BadInvite()` | Wrong or expired invite code | Ask the organizer for a fresh link |
| `Full()` | Squad already has its max members | Ask the organizer to start a new squad |
| `AlreadyMember()` | Joining twice | Open the squad instead |
| `OrganizerCannotLeave()` | Organizer tried to leave | Cancel the squad instead |
| `NotOrganizer()` | Non-organizer (or dropped organizer) tried start/cancel/remove | Only the organizer can do this |
| `NotMember()` | Caller isn't in the squad | Join first |
| `WrongState(current)` | Action not allowed in this phase | Refresh; show what the squad is waiting for |
| `TooFewMembers()` | Start with under 3 members | Invite more people |
| `NothingOwed()` | Deposit already fully locked | Nothing to do |
| `DepositWindowOpen()` | Finalize before the window closed | Wait for the deadline |
| `AlreadyPaid()` | Paying twice in one round | Nothing to do |
| `PastGrace()` | Paying after deadline + grace | The miss was covered by the deposit; refill it |
| `MemberStoppedPaying()` | Member marked stopped paying | No more payments accepted from this member |
| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |
| `RoundNotOpen(opensAt)` | Paying for a round before it opens | Wait until `opensAt` |
| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |
| `FaucetCapExceeded()` | Top-up over ₦200,000 in one call | Top up in smaller amounts |
| `NotWriter()` / `TrustRegistry.NotSquad()` | Registry access control | Deployment bug |
| `SquadFactory.NotSquad()` | `noteMembership` called by an address that is not a squad | Deployment bug (distinct from the registry's `NotSquad`) |
| `OwnableUnauthorizedAccount(address)` | Non-owner called a registry admin function | Use the registry owner account |
| `ERC20InsufficientAllowance(...)` | Member hasn't approved the squad to pull ₦ | App approves on join, then retries |
| `ERC20InsufficientBalance(...)` | Member doesn't have enough ₦ | Top up, then retry |
