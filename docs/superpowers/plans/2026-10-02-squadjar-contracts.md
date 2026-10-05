<!-- /autoplan restore point: "/Users/zorak/.gstack/projects/metropolis/main-autoplan-restore-20261002-191634.md" -->
## Implementation plan
# Squadjar Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the onchain core of Squadjar: a test naira token, a factory that holds trust records, and a per-squad contract that collects contributions, covers misses from deposits, and pays each round's collector.

**Architecture:**
- `TrustRegistry` holds the global trust record and outlives any factory. Its owner allowlists factories, and factories register the squads they create, which are then the only writers.
- `SquadFactory` deploys one `Squad` per group, registers it with the registry, and emits per-user `Membership` events for the app.
- `Squad` is a state machine (Open, Depositing, Active, Completed, Cancelled) that holds the jar. It is invite-only through a hashed invite code.
- All money moves are ERC-20 transfers of `AjoNGN` (ERC20Permit, no hooks).

**Tech Stack:**
- Solidity ^0.8.24
- Foundry (forge, forge-std)
- OpenZeppelin Contracts v5
- Monad testnet (chain id 10143, RPC `https://testnet-rpc.monad.xyz`)

**Spec:** `docs/superpowers/specs/2026-10-02-squadjar-design.md` (epic issue faroukobayanju/squadjar#1). Glossary: `CONTEXT.md`.

## Global Constraints

- Glossary terms only in identifiers and events: Squad, Jar, Member, Organizer, Contribution, Round, Payout, Collector, Turn, Deposit, Miss, Late, Stopped paying. Never "circle", "pot", "stake", "default".
- Token: name "Squadjar Naira", symbol `sNGN`, 18 decimals, `faucet` cap `200_000e18` per call.
- `createSquad` requires `contribution >= 100e18` and `3 <= maxMembers <= 20`.
- Trust score `onTime - 2*late - 10*missed + 3*completed` (int256). Tiers: New < 5, Building 5 to 19, Reliable >= 20.
- Deposit for turn p of n: `max(c, min(c*(n-p), cap))`, where cap is `3c` for Reliable members and unbounded otherwise.
- Period timing (seconds): Demo 300/60/300, Weekly 604800/43200/172800, Monthly 2592000/172800/259200 (roundLength/grace/depositWindow).
- A squad writes trust (on-time, late, missed, completed) only if it activated with `n >= 5`, `c >= 1000e18`, and a Weekly or Monthly period (Demo squads never write trust). Smaller squads write nothing. `completed` is credited only to members with zero misses who did not stop paying.
- Contracts are not upgradeable. Fixing a squad or factory bug means deploying a new factory and allowlisting it in the existing `TrustRegistry`, so trust history survives.
- `_finish` must never revert. Refunds are paid from the jar's actual balance (pro rata when short).

## Amendment 2026-10-03: `firstDeadline`

`createSquad` takes `uint64 firstDeadline` so a squad's deadlines land on a chosen weekday/time ("5k every Friday"). 0 keeps the old behavior (activation + roundLength). If activation runs past the anchor, round 1's deadline rolls forward by whole rounds so the weekday/time is kept. Monthly is still a fixed 30 days and drifts against calendar months (TODOS).

## Review Focus

1. A member who stops paying **before** collecting, while the jar has little deposit liquidity: settle must never revert, and fronting is capped by `totalLocked - frontedTotal` (test: `test_frontingCappedByLiquidity`).
2. `settleRound` called very late (after several round lengths): the next deadline must be in the future, not in the past (test: `test_lateSettleSchedulesFutureDeadline`).
3. The organizer is dropped during `finalizeDeposits`: the squad continues and nothing reverts (test: `test_organizerDroppedSquadContinues`).
4. Rounding when a stopped member's deposit doesn't divide evenly: the squad ends with a balance of exactly 0 (fuzz invariant plus `test_reliableStopperReducesLaterPayouts`).
5. `contribute` called by a member after they were marked stopped paying: it reverts and doesn't double count (test: `test_stoppedMemberCannotContribute`).
6. Fronted money not fully repaid by the end of the squad: `_finish` still completes and empties the jar (test: `test_finishNeverRevertsWhenJarShort`; invariant runs with `fail_on_revert = true`).
7. A member who missed once, didn't refill, but keeps paying every round: they are not marked stopped paying (test: `test_payingMemberWithLowDepositNotStopped`).

---

## File Structure

| File | Responsibility |
|---|---|
| `contracts/foundry.toml` | Foundry config, remappings, Monad RPC alias |
| `contracts/src/AjoNGN.sol` | Test naira ERC-20 with capped faucet |
| `contracts/src/ITrust.sol` | `ITrust` (read/write trust) and `IMembership` (membership events) interfaces |
| `contracts/src/TrustRegistry.sol` | Portable trust records; owner allowlists factories |
| `contracts/src/SquadFactory.sol` | Creates squads, timing presets, per-user `Membership` events |
| `contracts/src/Squad.sol` | One squad's jar and full lifecycle |
| `contracts/test/Base.t.sol` | Shared setup and helpers |
| `contracts/test/AjoNGN.t.sol` | Token tests |
| `contracts/test/TrustRegistry.t.sol` | Registry access control and trust math |
| `contracts/test/SquadFactory.t.sol` | Factory tests |
| `contracts/test/SquadSetup.t.sol` | Open and Depositing phase tests |
| `contracts/test/SquadRounds.t.sol` | Active phase, settlement, end tests |
| `contracts/test/Invariant.t.sol` | Balance conservation fuzz |
| `contracts/script/Deploy.s.sol` | Deploys token, registry, factory; writes `deployments/<chainId>.json` |
| `contracts/script/export-abi.sh` | Regenerates `abi/*.json` |
| `contracts/deployments/10143.json` | Monad testnet addresses (local 31337 is gitignored) |
| `contracts/abi/*.json` | ABIs exported for the app |
| `contracts/README.md` | Commands, lifecycle, invite recipe, error catalogue |

---

### Task 1: Foundry project and AjoNGN token

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/AjoNGN.sol`, `contracts/test/AjoNGN.t.sol`

**Interfaces:**
- Produces: `AjoNGN` (OZ ERC20) with `faucet(uint256 amount)`, `FAUCET_MAX = 200_000e18`, error `FaucetCapExceeded()`.

- [ ] **Step 1: Scaffold Foundry and install dependencies**

```bash
cd /Users/zorak/Desktop/metropolis
forge init contracts --no-git --no-deps
cd contracts
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std
git -C .. submodule status
```

Expected: `git submodule status` lists `contracts/lib/forge-std` and `contracts/lib/openzeppelin-contracts`.

- [ ] **Step 2: Write `contracts/foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
evm_version = "cancun"
optimizer = true
fs_permissions = [{ access = "read-write", path = "./deployments" }]
optimizer_runs = 200
remappings = [
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
  "forge-std/=lib/forge-std/src/",
]

[fuzz]
runs = 1000

[invariant]
runs = 256
depth = 60
fail_on_revert = true

[rpc_endpoints]
monad_testnet = "https://testnet-rpc.monad.xyz"
```

- [ ] **Step 3: Write the failing test `contracts/test/AjoNGN.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";

contract AjoNGNTest is Test {
    AjoNGN token;

    function setUp() public {
        token = new AjoNGN();
    }

    function test_metadata() public view {
        assertEq(token.name(), "Squadjar Naira");
        assertEq(token.symbol(), "sNGN");
        assertEq(token.decimals(), 18);
    }

    function test_faucetMintsToCaller() public {
        address u = makeAddr("u");
        vm.prank(u);
        token.faucet(50_000e18);
        assertEq(token.balanceOf(u), 50_000e18);
    }

    function test_faucetAllowsExactCap() public {
        token.faucet(200_000e18);
        assertEq(token.balanceOf(address(this)), 200_000e18);
    }

    function test_faucetRevertsAboveCap() public {
        vm.expectRevert(AjoNGN.FaucetCapExceeded.selector);
        token.faucet(200_000e18 + 1);
    }

    function test_permitSetsAllowance() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        address spender = makeAddr("spender");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner, spender, type(uint256).max, token.nonces(owner), deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        token.permit(owner, spender, type(uint256).max, deadline, v, r, s);
        assertEq(token.allowance(owner, spender), type(uint256).max);
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd contracts && forge test --match-contract AjoNGNTest`
Expected: compile error, `Source "src/AjoNGN.sol" not found`.

- [ ] **Step 5: Write `contracts/src/AjoNGN.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// Test naira for Monad testnet. Shown in the app as ₦.
/// Permit lets the app approve a squad with a signature instead of a separate transaction.
contract AjoNGN is ERC20, ERC20Permit {
    uint256 public constant FAUCET_MAX = 200_000e18;

    error FaucetCapExceeded();

    constructor() ERC20("Squadjar Naira", "sNGN") ERC20Permit("Squadjar Naira") {}

    function faucet(uint256 amount) external {
        if (amount > FAUCET_MAX) revert FaucetCapExceeded();
        _mint(msg.sender, amount);
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd contracts && forge test --match-contract AjoNGNTest`
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/zorak/Desktop/metropolis
git add contracts/foundry.toml contracts/src/AjoNGN.sol contracts/test/AjoNGN.t.sol contracts/lib .gitmodules
git commit -m "feat(contracts): add AjoNGN test naira with capped faucet and permit"
```

---

### Task 2: Trust registry, factory, and the squad's Open phase

**Files:**
- Create: `contracts/src/ITrust.sol`, `contracts/src/TrustRegistry.sol`, `contracts/src/SquadFactory.sol`, `contracts/src/Squad.sol`, `contracts/test/Base.t.sol`, `contracts/test/TrustRegistry.t.sol`, `contracts/test/SquadFactory.t.sol`, `contracts/test/SquadSetup.t.sol`

**Interfaces:**
- Consumes: `AjoNGN` from Task 1.
- Produces:
  - `ITrust`: `trustScore(address) view returns (int256)`, `tier(address) view returns (uint8)`, `recordContribution(address,bool)`, `recordMiss(address)`, `recordCompleted(address)`
  - `IMembership`: `noteMembership(address member, bool joined)`
  - `TrustRegistry(address owner)` implementing `ITrust`, plus:
    - `setWriter(address factory, bool allowed)` (owner only)
    - `registerSquad(address squad)` (writer factories only)
    - `isWriter(address)`, `isSquad(address)` (true only while the registering factory is allowlisted), `factoryOf(address)`
    - `records(address) returns (uint32 onTime, uint32 late, uint32 missed, uint32 completed)`
  - `SquadFactory(IERC20 token, TrustRegistry registry)` implementing `IMembership`, plus:
    - `enum Period { Demo, Weekly, Monthly }`
    - `createSquad(uint256 contribution, uint8 maxMembers, Period period, bytes32 inviteHash, uint64 firstDeadline) returns (address)`. `firstDeadline` anchors round 1's deadline to a chosen weekday/time (e.g. Friday 6pm); 0 = one roundLength after activation. Error `DeadlineInPast()` when nonzero and not in the future.
    - `timing(Period) pure returns (uint32,uint32,uint32)`
    - `isSquad(address)`, `squadCount()`
    - Event `Membership(address indexed member, address indexed squad, bool joined)`
  - `Squad`:
    - `enum State { Open, Depositing, Active, Completed, Cancelled }`
    - `join(bytes32 code)`, `leave()`, `cancel()`
    - Views: `memberCount()`, `memberAt(uint256)`, `isMember(address)`, `organizer()`, `state()`, `inviteHash()`
    - Errors: `WrongState()`, `NotOrganizer()`, `NotMember()`, `AlreadyMember()`, `Full()`, `OrganizerCannotLeave()`, `BadInvite()`
  - Invite hash convention: `inviteHash = keccak256(abi.encode(code))`, where `code` is a random `bytes32` the app puts in the invite link.

- [ ] **Step 1: Write the interfaces `contracts/src/ITrust.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITrust {
    function trustScore(address user) external view returns (int256);
    function tier(address user) external view returns (uint8);
    function recordContribution(address member, bool late) external;
    function recordMiss(address member) external;
    function recordCompleted(address member) external;
}

interface IMembership {
    function noteMembership(address member, bool joined) external;
}
```

- [ ] **Step 2: Write the shared test base `contracts/test/Base.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

abstract contract Base is Test {
    AjoNGN token;
    TrustRegistry registry;
    SquadFactory factory;
    address[] users;
    uint256 constant C = 1000e18;
    bytes32 constant CODE = keccak256("invite-code");
    bytes32 constant INVITE = keccak256(abi.encode(CODE));

    function setUp() public virtual {
        token = new AjoNGN();
        registry = new TrustRegistry(address(this));
        factory = new SquadFactory(token, registry);
        registry.setWriter(address(factory), true);
        for (uint256 i; i < 8; i++) {
            address u = makeAddr(string.concat("user", vm.toString(i)));
            users.push(u);
            vm.prank(u);
            token.faucet(200_000e18);
        }
    }

    /// users[0] organizes; users[1..n-1] join with the invite code. Everyone approves the squad.
    function _squad(uint256 n, uint256 c) internal returns (Squad s) {
        return _squadWith(n, c, SquadFactory.Period.Demo);
    }

    function _squadWith(uint256 n, uint256 c, SquadFactory.Period period) internal returns (Squad s) {
        vm.prank(users[0]);
        s = Squad(factory.createSquad(c, uint8(n), period, INVITE, 0));
        vm.prank(users[0]);
        token.approve(address(s), type(uint256).max);
        for (uint256 i = 1; i < n; i++) {
            vm.startPrank(users[i]);
            token.approve(address(s), type(uint256).max);
            s.join(CODE);
            vm.stopPrank();
        }
    }

    function _start(Squad s) internal {
        vm.prank(s.organizer());
        s.start();
    }

    function _lockAll(Squad s) internal {
        uint256 n = s.memberCount();
        for (uint256 i; i < n; i++) {
            address m = s.memberAt(i);
            if (s.locked(m) < s.required(m)) {
                vm.prank(m);
                s.lockDeposit();
            }
        }
    }

    /// Member with turn t (1-based), valid after start().
    function _turn(Squad s, uint256 t) internal view returns (address) {
        return s.memberAt(t - 1);
    }

    function _payAllExcept(Squad s, address skip) internal {
        uint256 opensAt = uint256(s.roundDeadline()) - s.roundLength();
        if (block.timestamp < opensAt) vm.warp(opensAt); // rounds open on schedule
        uint8 r = s.currentRound();
        uint256 n = s.memberCount();
        for (uint256 i; i < n; i++) {
            address m = s.memberAt(i);
            if (m == skip || s.stoppedPaying(m) || s.paid(r, m)) continue;
            if (s.currentRound() != r || s.state() != Squad.State.Active) return; // auto-settled
            vm.prank(m);
            s.contribute();
        }
    }

    function _warpPastGrace(Squad s) internal {
        vm.warp(uint256(s.roundDeadline()) + s.grace() + 1);
    }

    /// Gives `u` a trust score of 20 (Reliable) by writing as a registered squad.
    function _makeReliable(address u) internal {
        vm.prank(users[7]);
        address dummy = factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE, 0);
        vm.startPrank(dummy);
        for (uint256 i; i < 20; i++) registry.recordContribution(u, false);
        vm.stopPrank();
    }
}
```

- [ ] **Step 3: Write the failing registry tests `contracts/test/TrustRegistry.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract TrustRegistryTest is Base {
    function test_onlyOwnerSetsWriters() public {
        vm.prank(users[1]);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", users[1]));
        registry.setWriter(users[1], true);
    }

    function test_ownershipTransfersInTwoSteps() public {
        registry.transferOwnership(users[1]);
        assertEq(registry.owner(), address(this));
        vm.prank(users[1]);
        registry.acceptOwnership();
        assertEq(registry.owner(), users[1]);
    }

    function test_onlyWritersRegisterSquads() public {
        vm.prank(users[1]);
        vm.expectRevert(TrustRegistry.NotWriter.selector);
        registry.registerSquad(users[1]);
    }

    function test_recordsOnlyFromRegisteredSquads() public {
        vm.expectRevert(TrustRegistry.NotSquad.selector);
        registry.recordMiss(users[1]);
    }

    function test_factoryRegistersItsSquads() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        assertTrue(registry.isSquad(s));
    }

    function test_revokedFactorySquadsCannotWrite() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        registry.setWriter(address(factory), false);
        vm.prank(s);
        vm.expectRevert(TrustRegistry.NotSquad.selector);
        registry.recordMiss(users[1]);
    }

    function test_historySurvivesNewFactory() public {
        _makeReliable(users[2]);
        SquadFactory factory2 = new SquadFactory(token, registry);
        registry.setWriter(address(factory2), true);
        registry.setWriter(address(factory), false);
        assertEq(registry.trustScore(users[2]), 20);
        vm.prank(users[0]);
        address s = factory2.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        assertTrue(registry.isSquad(s));
    }

    function test_trustScoreMathAndTiers() public {
        vm.prank(users[7]);
        address s = factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE, 0);
        address u = users[1];
        assertEq(registry.tier(u), 0);
        vm.startPrank(s);
        for (uint256 i; i < 6; i++) registry.recordContribution(u, false); // +6
        assertEq(registry.trustScore(u), 6);
        assertEq(registry.tier(u), 1);
        registry.recordContribution(u, true); // -2
        registry.recordCompleted(u);          // +3
        assertEq(registry.trustScore(u), 7);
        registry.recordMiss(u);               // -10
        assertEq(registry.trustScore(u), -3);
        assertEq(registry.tier(u), 0);
        vm.stopPrank();
    }
}
```

- [ ] **Step 4: Write the failing factory tests `contracts/test/SquadFactory.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

contract SquadFactoryTest is Base {
    event Membership(address indexed member, address indexed squad, bool joined);

    function test_createSquadRegistersAndSetsOrganizer() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Weekly, INVITE, 0);
        assertTrue(factory.isSquad(s));
        assertEq(Squad(s).organizer(), users[0]);
        assertEq(Squad(s).memberCount(), 1);
        assertEq(Squad(s).inviteHash(), INVITE);
        assertEq(Squad(s).roundLength(), 604800);
        assertEq(Squad(s).grace(), 43200);
        assertEq(Squad(s).depositWindow(), 172800);
    }

    function test_createEmitsOrganizerMembership() public {
        vm.expectEmit(true, false, false, true, address(factory));
        emit Membership(users[0], address(0), true);
        vm.prank(users[0]);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsSmallContribution() public {
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.ContributionTooLow.selector, 100e18));
        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsSizeOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));
        factory.createSquad(C, 2, SquadFactory.Period.Demo, INVITE, 0);
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));
        factory.createSquad(C, 21, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsEmptyInvite() public {
        vm.expectRevert(SquadFactory.EmptyInvite.selector);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, bytes32(0), 0);
    }

    function test_createSquadRejectsPastDeadline() public {
        vm.warp(1000);
        vm.expectRevert(SquadFactory.DeadlineInPast.selector);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 1000);
    }

    function test_timingPresets() public view {
        (uint32 rl, uint32 g, uint32 dw) = factory.timing(SquadFactory.Period.Demo);
        assertEq(rl, 300); assertEq(g, 60); assertEq(dw, 300);
        (rl, g, dw) = factory.timing(SquadFactory.Period.Monthly);
        assertEq(rl, 2592000); assertEq(g, 172800); assertEq(dw, 259200);
    }

    function test_noteMembershipOnlyFromSquads() public {
        vm.expectRevert(SquadFactory.NotSquad.selector);
        factory.noteMembership(users[1], true);
    }
}
```

Note: `test_createEmitsOrganizerMembership` checks only the indexed `member` topic and the data (`joined`). The squad address isn't known before the call, so topic 2 is not checked.

- [ ] **Step 5: Write the failing Open-phase tests `contracts/test/SquadSetup.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Squad} from "../src/Squad.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract SquadSetupTest is Base {
    function test_joinAddsMember() public {
        Squad s = _squad(3, C);
        assertEq(s.memberCount(), 3);
        assertTrue(s.isMember(users[2]));
    }

    function test_joinRequiresInviteCode() public {
        vm.prank(users[0]);
        Squad open = Squad(factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0));
        vm.prank(users[4]);
        vm.expectRevert(Squad.BadInvite.selector);
        open.join(keccak256("wrong"));
    }

    function test_joinRevertsWhenFull() public {
        Squad s = _squad(3, C);
        vm.prank(users[3]);
        vm.expectRevert(Squad.Full.selector);
        s.join(CODE);
    }

    function test_joinRevertsForExistingMember() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(Squad.AlreadyMember.selector);
        s.join(CODE);
    }

    function test_leaveRemovesMember() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        s.leave();
        assertFalse(s.isMember(users[1]));
        assertEq(s.memberCount(), 2);
    }

    function test_organizerRemovesMemberWhileOpen() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(Squad.NotOrganizer.selector);
        s.remove(users[2]);
        vm.prank(users[0]);
        s.remove(users[2]);
        assertFalse(s.isMember(users[2]));
        assertEq(s.memberCount(), 2);
    }

    function test_organizerCannotLeave() public {
        Squad s = _squad(3, C);
        vm.prank(users[0]);
        vm.expectRevert(Squad.OrganizerCannotLeave.selector);
        s.leave();
    }

    function test_joinWithPermitApprovesAndJoins() public {
        vm.prank(users[0]);
        Squad open = Squad(factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0));
        (address joiner, uint256 key) = makeAddrAndKey("permitJoiner");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                joiner, address(open), type(uint256).max, token.nonces(joiner), deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(key, digest);
        vm.prank(joiner);
        open.joinWithPermit(CODE, deadline, v, r, sg);
        assertTrue(open.isMember(joiner));
        assertEq(token.allowance(joiner, address(open)), type(uint256).max);
    }

    function test_cancelByOrganizerOnly() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(Squad.NotOrganizer.selector);
        s.cancel();
        vm.prank(users[0]);
        s.cancel();
        assertEq(uint8(s.state()), uint8(Squad.State.Cancelled));
    }
}
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd contracts && forge test --match-contract "TrustRegistryTest|SquadFactoryTest|SquadSetupTest"`
Expected: compile error, `Source "src/TrustRegistry.sol" not found`.

- [ ] **Step 7: Write `contracts/src/TrustRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ITrust} from "./ITrust.sol";

/// Portable trust history. Survives factory redeploys: the owner allowlists factories,
/// factories register the squads they create, and only registered squads write.
contract TrustRegistry is ITrust, Ownable2Step {
    uint8 public constant NEW = 0;
    uint8 public constant BUILDING = 1;
    uint8 public constant RELIABLE = 2;

    struct Record {
        uint32 onTime;
        uint32 late;
        uint32 missed;
        uint32 completed;
    }

    mapping(address => bool) public isWriter;
    mapping(address => address) public factoryOf; // squad => factory that registered it
    mapping(address => Record) public records;

    event WriterSet(address indexed factory, bool allowed);
    event SquadRegistered(address indexed factory, address indexed squad);

    error NotWriter();
    error NotSquad();

    /// Ownable2Step: the owner key can be rotated (transferOwnership + acceptOwnership).
    constructor(address _owner) Ownable(_owner) {}

    function setWriter(address factory, bool allowed) external onlyOwner {
        isWriter[factory] = allowed;
        emit WriterSet(factory, allowed);
    }

    function registerSquad(address squad) external {
        if (!isWriter[msg.sender]) revert NotWriter();
        factoryOf[squad] = msg.sender;
        emit SquadRegistered(msg.sender, squad);
    }

    /// A squad may write only while its factory is still allowlisted.
    function isSquad(address squad) public view returns (bool) {
        return isWriter[factoryOf[squad]];
    }

    modifier onlySquad() {
        if (!isSquad(msg.sender)) revert NotSquad();
        _;
    }

    function trustScore(address user) public view returns (int256) {
        Record memory r = records[user];
        return int256(uint256(r.onTime)) - 2 * int256(uint256(r.late)) - 10 * int256(uint256(r.missed))
            + 3 * int256(uint256(r.completed));
    }

    function tier(address user) external view returns (uint8) {
        int256 s = trustScore(user);
        if (s >= 20) return RELIABLE;
        if (s >= 5) return BUILDING;
        return NEW;
    }

    function recordContribution(address member, bool late) external onlySquad {
        if (late) records[member].late++;
        else records[member].onTime++;
    }

    function recordMiss(address member) external onlySquad {
        records[member].missed++;
    }

    function recordCompleted(address member) external onlySquad {
        records[member].completed++;
    }
}
```

- [ ] **Step 8: Write `contracts/src/SquadFactory.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITrust, IMembership} from "./ITrust.sol";
import {TrustRegistry} from "./TrustRegistry.sol";
import {Squad} from "./Squad.sol";

contract SquadFactory is IMembership {
    enum Period { Demo, Weekly, Monthly }

    IERC20 public immutable token;
    TrustRegistry public immutable registry;
    mapping(address => bool) public isSquad;
    address[] public squads;

    event SquadCreated(
        address indexed squad, address indexed organizer, uint256 contribution, uint8 maxMembers, Period period
    );
    /// Lets the app list a user's squads with one indexed log query.
    event Membership(address indexed member, address indexed squad, bool joined);

    error ContributionTooLow(uint256 min);
    error SizeOutOfRange(uint8 min, uint8 max);
    error EmptyInvite();
    error DeadlineInPast();
    error NotSquad();

    constructor(IERC20 _token, TrustRegistry _registry) {
        token = _token;
        registry = _registry;
    }

    function timing(Period p) public pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow) {
        if (p == Period.Demo) return (300, 60, 300);
        if (p == Period.Weekly) return (604800, 43200, 172800);
        return (2592000, 172800, 259200);
    }

    function createSquad(
        uint256 contribution,
        uint8 maxMembers,
        Period period,
        bytes32 inviteHash,
        uint64 firstDeadline
    ) external returns (address) {
        if (contribution < 100e18) revert ContributionTooLow(100e18);
        if (maxMembers < 3 || maxMembers > 20) revert SizeOutOfRange(3, 20);
        if (inviteHash == bytes32(0)) revert EmptyInvite();
        if (firstDeadline != 0 && firstDeadline <= block.timestamp) revert DeadlineInPast();
        (uint32 rl, uint32 g, uint32 dw) = timing(period);
        Squad s = new Squad(
            token, ITrust(address(registry)), IMembership(address(this)), msg.sender, contribution, maxMembers, rl, g, dw, inviteHash, firstDeadline
        );
        isSquad[address(s)] = true;
        squads.push(address(s));
        registry.registerSquad(address(s));
        emit SquadCreated(address(s), msg.sender, contribution, maxMembers, period);
        emit Membership(msg.sender, address(s), true);
        return address(s);
    }

    function squadCount() external view returns (uint256) {
        return squads.length;
    }

    function noteMembership(address member, bool joined) external {
        if (!isSquad[msg.sender]) revert NotSquad();
        emit Membership(member, msg.sender, joined);
    }
}
```

- [ ] **Step 9: Write `contracts/src/Squad.sol` (storage plus Open phase; later tasks add to this file)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ITrust, IMembership} from "./ITrust.sol";

/// One squad's jar. No member controls the money once rounds begin.
contract Squad {
    using SafeERC20 for IERC20;

    enum State { Open, Depositing, Active, Completed, Cancelled }

    uint8 public constant RELIABLE = 2;
    uint256 public constant TRUST_MIN_MEMBERS = 5;
    uint256 public constant TRUST_MIN_CONTRIBUTION = 1000e18;
    uint32 public constant TRUST_MIN_ROUND_LENGTH = 604800; // Weekly or longer

    IERC20 public immutable token;
    ITrust public immutable trust;
    IMembership public immutable factory;
    address public immutable organizer;
    uint256 public immutable contribution;
    uint8 public immutable maxMembers;
    uint32 public immutable roundLength;
    uint32 public immutable grace;
    uint32 public immutable depositWindow;
    bytes32 public immutable inviteHash;
    uint64 public immutable firstDeadline; // round 1 deadline anchor (weekday/payday); 0 = activation + roundLength

    State public state;
    address[] internal members; // join order while Open; turn order (index + 1) after start
    mapping(address => bool) public isMember;
    mapping(address => uint8) public turnOf;
    mapping(address => uint256) public locked;
    mapping(address => uint256) public required;
    mapping(address => bool) public stoppedPaying;
    mapping(address => uint8) public missCount;
    mapping(address => uint8) public refillBy; // round by whose settlement the deposit must be refilled; 0 = none
    mapping(address => uint256) public owed; // fronted for this member, repaid from their payout
    mapping(address => uint256) public coverPerRound; // for members who stopped paying after collecting
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(address => bool) public cappedAtStart; // Reliable when the squad started (tier is not re-read later)

    bool public countsForTrust; // set at activation: n >= 5 and c >= 1000e18
    uint64 public depositDeadline;
    uint64 public roundDeadline;
    uint8 public currentRound;
    uint8 public paidCount;
    uint8 public activeCount;
    uint256 public roundContributions;
    uint256 public totalLocked;
    uint256 public frontedTotal;

    event Joined(address indexed member);
    event Left(address indexed member);
    event Cancelled();

    error WrongState(State current);
    error NotOrganizer();
    error NotMember();
    error AlreadyMember();
    error Full();
    error OrganizerCannotLeave();
    error BadInvite();

    modifier inState(State s) {
        if (state != s) revert WrongState(state);
        _;
    }

    modifier onlyMember() {
        if (!isMember[msg.sender]) revert NotMember();
        _;
    }

    constructor(
        IERC20 _token,
        ITrust _trust,
        IMembership _factory,
        address _organizer,
        uint256 _contribution,
        uint8 _maxMembers,
        uint32 _roundLength,
        uint32 _grace,
        uint32 _depositWindow,
        bytes32 _inviteHash,
        uint64 _firstDeadline
    ) {
        token = _token;
        trust = _trust;
        factory = _factory;
        organizer = _organizer;
        contribution = _contribution;
        maxMembers = _maxMembers;
        roundLength = _roundLength;
        grace = _grace;
        depositWindow = _depositWindow;
        inviteHash = _inviteHash;
        firstDeadline = _firstDeadline;
        members.push(_organizer);
        isMember[_organizer] = true;
        emit Joined(_organizer); // the factory emits the organizer's Membership event
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function memberAt(uint256 i) external view returns (address) {
        return members[i];
    }

    /// `code` travels in the invite link; only its hash is stored.
    function join(bytes32 code) public inState(State.Open) {
        if (keccak256(abi.encode(code)) != inviteHash) revert BadInvite();
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= maxMembers) revert Full();
        members.push(msg.sender);
        isMember[msg.sender] = true;
        factory.noteMembership(msg.sender, true);
        emit Joined(msg.sender);
    }

    /// Join and grant this squad an unlimited allowance in one transaction.
    /// A failed permit (e.g. already used) is ignored; transfers later revert if no allowance exists.
    function joinWithPermit(bytes32 code, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        try IERC20Permit(address(token)).permit(msg.sender, address(this), type(uint256).max, deadline, v, r, s) {} catch {}
        join(code);
    }

    function leave() external inState(State.Open) onlyMember {
        if (msg.sender == organizer) revert OrganizerCannotLeave();
        _removeMember(msg.sender);
    }

    /// Organizer removes a stranger who used a leaked invite code. Open phase only.
    function remove(address m) external inState(State.Open) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (!isMember[m]) revert NotMember();
        if (m == organizer) revert OrganizerCannotLeave();
        _removeMember(m);
    }

    function _removeMember(address m) internal {
        uint256 n = members.length;
        for (uint256 i; i < n; i++) {
            if (members[i] == m) {
                members[i] = members[n - 1];
                members.pop();
                break;
            }
        }
        isMember[m] = false;
        factory.noteMembership(m, false);
        emit Left(m);
    }

    function cancel() external {
        if (msg.sender != organizer || !isMember[organizer]) revert NotOrganizer(); // a dropped organizer has no powers
        if (state != State.Open && state != State.Depositing) revert WrongState(state);
        _cancelAndRefund();
    }

    function _cancelAndRefund() internal {
        uint256 n = members.length;
        for (uint256 i; i < n; i++) _refund(members[i]);
        state = State.Cancelled;
        emit Cancelled();
    }

    function _refund(address m) internal {
        uint256 x = locked[m];
        if (x == 0) return;
        locked[m] = 0;
        totalLocked -= x;
        token.safeTransfer(m, x);
    }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract "TrustRegistryTest|SquadFactoryTest|SquadSetupTest"`
Expected: 25 tests pass (8 registry + 8 factory + 9 setup).

- [ ] **Step 11: Commit**

```bash
git add contracts/src contracts/test
git commit -m "feat(contracts): trust registry, invite-only squads, factory membership events"
```

---

### Task 3: Start, turn order, deposits

**Files:**
- Modify: `contracts/src/Squad.sol` (add the functions below inside the contract; add the events and errors next to the existing ones)
- Modify: `contracts/test/SquadSetup.t.sol` (append tests)

**Interfaces:**
- Consumes: `ITrust.trustScore`, `ITrust.tier`.
- Produces:
  - `start()`, `lockDeposit()`, `finalizeDeposits()`
  - Events `Started(address[] order)`, `DepositLocked(address member, uint256 amount)`, `Dropped(address member)`, `Activated(uint64 roundDeadline)`
  - Errors `TooFewMembers()`, `NothingOwed()`, `DepositWindowOpen()`

- [ ] **Step 1: Append the failing tests to `contracts/test/SquadSetup.t.sol` (inside `SquadSetupTest`)**

```solidity
    function test_startRequiresOrganizerAndThreeMembers() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(Squad.NotOrganizer.selector);
        s.start();
        vm.prank(users[1]);
        s.leave();
        vm.prank(users[0]);
        vm.expectRevert(Squad.TooFewMembers.selector);
        s.start();
    }

    function test_depositFormulaFullAndFloor() public {
        Squad s = _squad(3, C);
        _start(s);
        assertEq(uint8(s.state()), uint8(Squad.State.Depositing));
        assertEq(s.required(_turn(s, 1)), 2 * C);
        assertEq(s.required(_turn(s, 2)), C);
        assertEq(s.required(_turn(s, 3)), C); // floor of c
        assertEq(s.turnOf(_turn(s, 2)), 2);
    }

    function test_reliableMemberGoesFirstWithCappedDeposit() public {
        _makeReliable(users[2]);
        Squad s = _squad(5, C);
        _start(s);
        assertEq(_turn(s, 1), users[2]);
        assertEq(s.required(users[2]), 3 * C); // 4c capped at 3c
        assertEq(s.required(_turn(s, 2)), 3 * C); // not reliable, full 3c
    }

    function test_lockAllActivatesRoundOne() public {
        Squad s = _squad(3, C);
        _start(s);
        _lockAll(s);
        assertEq(uint8(s.state()), uint8(Squad.State.Active));
        assertEq(s.currentRound(), 1);
        assertEq(s.roundDeadline(), block.timestamp + 300);
        assertEq(s.totalLocked(), 4 * C);
    }

    function test_lockTwiceReverts() public {
        Squad s = _squad(4, C);
        _start(s);
        address m = _turn(s, 1);
        vm.prank(m);
        s.lockDeposit();
        vm.prank(m);
        vm.expectRevert(Squad.NothingOwed.selector);
        s.lockDeposit();
    }

    function test_finalizeBeforeDeadlineReverts() public {
        Squad s = _squad(3, C);
        _start(s);
        vm.expectRevert(Squad.DepositWindowOpen.selector);
        s.finalizeDeposits();
    }

    function test_finalizeDropsNonLockerRecomputesAndRefundsExcess() public {
        Squad s = _squad(4, C);
        _start(s);
        address t1 = _turn(s, 1);
        address t2 = _turn(s, 2);
        address t3 = _turn(s, 3);
        address t4 = _turn(s, 4);
        vm.prank(t1); s.lockDeposit(); // 3c
        vm.prank(t2); s.lockDeposit(); // 2c
        vm.prank(t3); s.lockDeposit(); // c
        uint256 t1Before = token.balanceOf(t1);
        vm.warp(block.timestamp + 301);
        s.finalizeDeposits();
        assertFalse(s.isMember(t4));
        assertEq(s.memberCount(), 3);
        assertEq(_turn(s, 1), t1); // relative order kept
        assertEq(s.required(t1), 2 * C); // n=3 now
        assertEq(token.balanceOf(t1) - t1Before, C); // excess refunded
        assertEq(uint8(s.state()), uint8(Squad.State.Active));
    }

    function test_finalizeCancelsWhenUnderThree() public {
        Squad s = _squad(3, C);
        _start(s);
        address t1 = _turn(s, 1);
        vm.prank(t1); s.lockDeposit();
        uint256 before = token.balanceOf(t1);
        vm.warp(block.timestamp + 301);
        s.finalizeDeposits();
        assertEq(uint8(s.state()), uint8(Squad.State.Cancelled));
        assertEq(token.balanceOf(t1) - before, 2 * C);
    }

    function test_organizerDroppedSquadContinues() public {
        Squad s = _squad(4, C);
        _start(s);
        for (uint256 i; i < 4; i++) {
            address m = s.memberAt(i);
            if (m == users[0]) continue;
            vm.prank(m);
            s.lockDeposit();
        }
        vm.warp(block.timestamp + 301);
        s.finalizeDeposits();
        assertFalse(s.isMember(users[0]));
        assertEq(s.memberCount(), 3);
        // Requirements never rise after a drop, so the squad activates immediately.
        assertEq(uint8(s.state()), uint8(Squad.State.Active));
    }

    function _anchored(uint64 firstDeadline) internal returns (Squad s) {
        vm.prank(users[0]);
        s = Squad(factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE, firstDeadline));
        vm.prank(users[0]);
        token.approve(address(s), type(uint256).max);
        for (uint256 i = 1; i < 3; i++) {
            vm.startPrank(users[i]);
            token.approve(address(s), type(uint256).max);
            s.join(CODE);
            vm.stopPrank();
        }
        _start(s);
    }

    function test_firstDeadlineAnchorsRoundOne() public {
        uint64 anchor = uint64(block.timestamp + 1000);
        Squad s = _anchored(anchor);
        _lockAll(s);
        assertEq(s.roundDeadline(), anchor);
    }

    function test_firstDeadlineRollsForwardWholeRounds() public {
        uint64 anchor = uint64(block.timestamp + 100);
        Squad s = _anchored(anchor);
        vm.warp(anchor + 250); // activation lands after the anchor
        _lockAll(s);
        assertEq(s.roundDeadline(), anchor + 300); // same phase, next whole round
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd contracts && forge test --match-contract SquadSetupTest`
Expected: compile error, `Member "start" not found`.

- [ ] **Step 3: Add to `contracts/src/Squad.sol` (events and errors next to the existing ones, functions after `cancel`)**

```solidity
    event Started(address[] order);
    event DepositLocked(address indexed member, uint256 amount);
    event Dropped(address indexed member);
    event Activated(uint64 roundDeadline);

    error TooFewMembers();
    error NothingOwed();
    error DepositWindowOpen();

    function start() external inState(State.Open) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length < 3) revert TooFewMembers();
        _sortByTrust();
        for (uint256 i; i < members.length; i++) cappedAtStart[members[i]] = trust.tier(members[i]) == RELIABLE;
        _assignTurnsAndDeposits();
        state = State.Depositing;
        depositDeadline = uint64(block.timestamp + depositWindow);
        emit Started(members);
    }

    function _requiredDepositFor(address m, uint256 n, uint256 p) internal view returns (uint256) {
        uint256 c = contribution;
        uint256 full = c * (n - p);
        if (cappedAtStart[m] && full > 3 * c) full = 3 * c;
        return full < c ? c : full;
    }

    function lockDeposit() external inState(State.Depositing) onlyMember {
        if (locked[msg.sender] >= required[msg.sender]) revert NothingOwed();
        uint256 amt = required[msg.sender] - locked[msg.sender];
        _pullDeposit(msg.sender, amt);
        emit DepositLocked(msg.sender, amt);
        if (_allLocked()) _activate();
    }

    function finalizeDeposits() external inState(State.Depositing) {
        if (block.timestamp <= depositDeadline) revert DepositWindowOpen();
        uint256 n = members.length;
        address[] memory kept = new address[](n);
        uint256 k;
        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (locked[m] >= required[m]) {
                kept[k++] = m;
            } else {
                _refund(m);
                isMember[m] = false;
                factory.noteMembership(m, false);
                emit Dropped(m);
            }
        }
        delete members;
        for (uint256 i; i < k; i++) members.push(kept[i]);
        if (k < 3) {
            _cancelAndRefund();
            return;
        }
        _assignTurnsAndDeposits();
        for (uint256 i; i < k; i++) {
            address m = members[i];
            if (locked[m] > required[m]) {
                uint256 x = locked[m] - required[m];
                locked[m] = required[m];
                totalLocked -= x;
                token.safeTransfer(m, x);
            }
        }
        // Dropping members only moves turns up in a smaller squad, so c*(n-p) never rises
        // and the cap was fixed at start: every kept member is fully locked.
        _activate();
    }

    function _sortByTrust() internal {
        uint256 n = members.length;
        int256[] memory score = new int256[](n);
        bytes32[] memory key = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            score[i] = trust.trustScore(members[i]);
            key[i] = keccak256(abi.encode(block.prevrandao, address(this), members[i]));
        }
        for (uint256 i = 1; i < n; i++) {
            address m = members[i];
            int256 sc = score[i];
            bytes32 ky = key[i];
            uint256 j = i;
            while (j > 0 && (score[j - 1] < sc || (score[j - 1] == sc && key[j - 1] > ky))) {
                members[j] = members[j - 1];
                score[j] = score[j - 1];
                key[j] = key[j - 1];
                j--;
            }
            members[j] = m;
            score[j] = sc;
            key[j] = ky;
        }
    }

    function _assignTurnsAndDeposits() internal {
        uint256 n = members.length;
        for (uint256 i; i < n; i++) {
            address m = members[i];
            turnOf[m] = uint8(i + 1);
            required[m] = _requiredDepositFor(m, n, i + 1);
        }
        activeCount = uint8(n);
    }

    function _allLocked() internal view returns (bool) {
        uint256 n = members.length;
        for (uint256 i; i < n; i++) {
            if (locked[members[i]] < required[members[i]]) return false;
        }
        return true;
    }

    function _activate() internal {
        state = State.Active;
        // Demo squads (5-minute rounds) never write trust: otherwise sybils farm Reliable in an hour.
        countsForTrust = members.length >= TRUST_MIN_MEMBERS && contribution >= TRUST_MIN_CONTRIBUTION
            && roundLength >= TRUST_MIN_ROUND_LENGTH;
        currentRound = 1;
        uint64 d = firstDeadline;
        // Keep the chosen weekday/time: if activation ran past the anchor, roll forward whole rounds.
        if (d == 0) d = uint64(block.timestamp + roundLength);
        else if (d <= block.timestamp) d += uint64(((block.timestamp - d) / roundLength + 1) * roundLength);
        roundDeadline = d;
        emit Activated(roundDeadline);
    }

    function _pullDeposit(address m, uint256 amt) internal {
        token.safeTransferFrom(m, address(this), amt);
        locked[m] += amt;
        totalLocked += amt;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract SquadSetupTest`
Expected: 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/Squad.sol contracts/test/SquadSetup.t.sol
git commit -m "feat(contracts): trust-ordered turns, deposits, and deposit finalization"
```

---

### Task 4: Contributions, settlement, refills, stopping, end of squad

**Files:**
- Modify: `contracts/src/Squad.sol` (add the code below)
- Create: `contracts/test/SquadRounds.t.sol`

**Interfaces:**
- Consumes: `ITrust.recordContribution`, `recordMiss`, `recordCompleted`.
- Produces:
  - `contribute()`, `refillDeposit()`, `settleRound(uint8 round)`, `getState() view returns (SquadView)`
  - Events `Contributed(address member, uint8 round, bool late)`, `RoundSettled(uint8 round, address collector, uint256 amount, address[] missed)`, `StoppedPaying(address member)`, `Completed()`
  - Errors `AlreadyPaid()`, `PastGrace()`, `MemberStoppedPaying()`, `TooEarly()`, `AlreadySettled()`
  - `struct SquadView { State state; uint256 contribution; uint8 maxMembers; uint32 roundLength; uint32 grace; uint64 depositDeadline; uint64 roundDeadline; uint8 currentRound; address organizer; address[] members; uint256[] locked; uint256[] required; bool[] paidThisRound; bool[] stopped; uint8[] misses; uint8[] refillBy; uint256[] owed; bool countsForTrust; uint8 activeCount; uint256 totalLocked; uint64 settleableAfter; }`. Turn equals array index + 1 after start.

- [ ] **Step 1: Write the failing tests `contracts/test/SquadRounds.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Squad} from "../src/Squad.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract SquadRoundsTest is Base {
    function _active(uint256 n, uint256 c) internal returns (Squad s) {
        s = _squad(n, c);
        _start(s);
        _lockAll(s);
    }

    function test_happyPathThreeMembersIsZeroSum() public {
        uint256[3] memory before;
        for (uint256 i; i < 3; i++) before[i] = token.balanceOf(users[i]);
        Squad s = _active(3, C);
        for (uint256 r = 1; r <= 3; r++) _payAllExcept(s, address(0));
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        for (uint256 i; i < 3; i++) assertEq(token.balanceOf(users[i]), before[i]);
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_lastContributionAutoSettlesAndPaysCollector() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        uint256 before = token.balanceOf(t1);
        _payAllExcept(s, address(0));
        assertEq(s.currentRound(), 2);
        assertEq(token.balanceOf(t1) - before, 3 * C - C); // got 3c, paid c
    }

    function test_contributeTwiceReverts() public {
        Squad s = _active(3, C);
        address m = _turn(s, 2);
        vm.prank(m);
        s.contribute();
        vm.prank(m);
        vm.expectRevert(Squad.AlreadyPaid.selector);
        s.contribute();
    }

    function test_lateContributionRecordedLate() public {
        Squad s = _squadWith(5, C, SquadFactory.Period.Weekly); // 5 members, ₦1000, Weekly: counts for trust
        _start(s);
        _lockAll(s);
        address m = _turn(s, 2);
        vm.warp(uint256(s.roundDeadline()) + 10);
        vm.prank(m);
        s.contribute();
        (, uint32 late,,) = registry.records(m);
        assertEq(late, 1);
    }

    function test_cannotPayAheadAfterEarlyAutoSettle() public {
        Squad s = _active(3, C);
        _payAllExcept(s, address(0)); // round 1 auto-settles immediately
        uint64 opensAt = s.roundDeadline() - s.roundLength();
        vm.prank(_turn(s, 2));
        vm.expectRevert(abi.encodeWithSelector(Squad.RoundNotOpen.selector, opensAt));
        s.contribute();
        vm.warp(opensAt);
        vm.prank(_turn(s, 2));
        s.contribute();
    }

    function test_contributeAfterGraceReverts() public {
        Squad s = _active(3, C);
        _warpPastGrace(s);
        vm.prank(_turn(s, 2));
        vm.expectRevert(Squad.PastGrace.selector);
        s.contribute();
    }

    function test_settleEarlyRevertsAndTwiceRevertsAlreadySettled() public {
        Squad s = _active(3, C);
        vm.expectRevert(abi.encodeWithSelector(Squad.TooEarly.selector, s.settleableAfter()));
        s.settleRound(1);
        _payAllExcept(s, address(0)); // auto-settles round 1
        vm.expectRevert(Squad.AlreadySettled.selector);
        s.settleRound(1);
    }

    function test_missAfterCollectingCoveredByDepositFullPayout() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t2 = _turn(s, 2);
        _payAllExcept(s, address(0)); // round 1, t1 collects
        _payAllExcept(s, t1);         // round 2, t1 misses
        uint256 before = token.balanceOf(t2);
        _warpPastGrace(s);
        vm.prank(makeAddr("anyone"));
        s.settleRound(2);
        assertEq(token.balanceOf(t2) - before, 3 * C); // full payout
        assertEq(s.locked(t1), C); // 2c - c
        assertEq(s.missCount(t1), 1);
        assertEq(s.refillBy(t1), 3);
        (,, uint32 missed,) = registry.records(t1);
        assertEq(missed, 0); // 3-member squads never write trust
    }

    function test_refillClearsObligation() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        _payAllExcept(s, address(0));
        _payAllExcept(s, t1);
        _warpPastGrace(s);
        s.settleRound(2);
        vm.prank(t1);
        s.refillDeposit();
        assertEq(s.locked(t1), 2 * C);
        assertEq(s.refillBy(t1), 0);
        _payAllExcept(s, address(0));
        assertFalse(s.stoppedPaying(t1));
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
    }

    function test_noRefillMarksStoppedPaying() public {
        Squad s = _active(4, C);
        address t1 = _turn(s, 1);
        _payAllExcept(s, address(0)); // r1
        _payAllExcept(s, t1);         // r2 miss
        _warpPastGrace(s);
        s.settleRound(2);
        _payAllExcept(s, t1);         // r3 miss again, no refill
        _warpPastGrace(s);
        s.settleRound(3);
        assertTrue(s.stoppedPaying(t1));
        assertEq(s.activeCount(), 3);
    }

    function test_stoppedMemberCannotContribute() public {
        Squad s = _active(4, C);
        address t1 = _turn(s, 1);
        _payAllExcept(s, address(0));
        _payAllExcept(s, t1);
        _warpPastGrace(s);
        s.settleRound(2);
        _payAllExcept(s, t1);
        _warpPastGrace(s);
        s.settleRound(3);
        vm.prank(t1);
        vm.expectRevert(Squad.MemberStoppedPaying.selector);
        s.contribute();
    }

    function test_stoppedBeforeCollectingIsFrontedThenRepaidZeroSum() public {
        uint256[3] memory before;
        for (uint256 i; i < 3; i++) before[i] = token.balanceOf(users[i]);
        Squad s = _active(3, C);
        address t3 = _turn(s, 3);
        _payAllExcept(s, t3); // r1: t3 misses, deposit c covers
        _warpPastGrace(s);
        s.settleRound(1);
        _payAllExcept(s, t3); // r2: t3 no refill -> stopped; fronted c
        _warpPastGrace(s);
        s.settleRound(2);
        assertTrue(s.stoppedPaying(t3));
        assertEq(s.owed(t3), C);
        assertEq(s.frontedTotal(), C);
        _payAllExcept(s, t3); // r3: t3 collects; fronted again then repaid from payout
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(s.frontedTotal(), 0);
        assertEq(token.balanceOf(address(s)), 0);
        for (uint256 i; i < 3; i++) assertEq(token.balanceOf(users[i]), before[i]);
    }

    function test_reliableStopperReducesLaterPayouts() public {
        _makeReliable(users[0]);
        Squad s = _active(5, C);
        address t1 = _turn(s, 1);
        assertEq(t1, users[0]);
        assertEq(s.required(t1), 3 * C);
        _payAllExcept(s, address(0)); // r1: t1 collects 5c
        _payAllExcept(s, t1);         // r2: miss, covered
        _warpPastGrace(s);
        s.settleRound(2);
        _payAllExcept(s, t1);         // r3: stopped; locked 2c spread over 3 rounds
        address t3 = _turn(s, 3);
        uint256 before = token.balanceOf(t3);
        _warpPastGrace(s);
        s.settleRound(3);
        assertTrue(s.stoppedPaying(t1));
        assertEq(token.balanceOf(t3) - before, 4 * C + (2 * C) / 3);
        _payAllExcept(s, address(0)); // r4 auto-settles with 4 active
        _payAllExcept(s, address(0)); // r5
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_frontingCappedByLiquidity() public {
        Squad s = _active(3, C);
        address t2 = _turn(s, 2);
        address t3 = _turn(s, 3);
        // t2 and t3 both miss round 1 and never refill: liquidity is only t1's 2c
        vm.prank(_turn(s, 1));
        s.contribute();
        _warpPastGrace(s);
        s.settleRound(1);
        vm.prank(_turn(s, 1));
        s.contribute();
        _warpPastGrace(s);
        s.settleRound(2); // both stopped; fronting limited; must not revert
        assertTrue(s.stoppedPaying(t2));
        assertTrue(s.stoppedPaying(t3));
        assertLe(s.frontedTotal(), s.totalLocked());
    }

    function test_lateSettleSchedulesFutureDeadline() public {
        Squad s = _active(3, C);
        vm.warp(block.timestamp + 10 days);
        s.settleRound(1);
        assertGt(uint256(s.roundDeadline()), block.timestamp);
    }

    function test_completedRecordedOnlyForBigEnoughSquads() public {
        Squad small = _active(3, C);
        for (uint256 r; r < 3; r++) _payAllExcept(small, address(0));
        (,,, uint32 doneSmall) = registry.records(users[1]);
        assertEq(doneSmall, 0);

        Squad demo = _active(5, C); // right size but Demo period: no trust
        for (uint256 r; r < 5; r++) _payAllExcept(demo, address(0));
        (,,, uint32 doneDemo) = registry.records(users[1]);
        assertEq(doneDemo, 0);

        Squad big = _squadWith(5, C, SquadFactory.Period.Weekly); // new squad, same users
        _start(big);
        _lockAll(big);
        for (uint256 r; r < 5; r++) _payAllExcept(big, address(0));
        (,,, uint32 doneBig) = registry.records(users[1]);
        assertEq(doneBig, 1);
    }

    function test_payingMemberWithLowDepositNotStopped() public {
        Squad s = _active(4, C);
        address t1 = _turn(s, 1);
        _payAllExcept(s, address(0)); // r1
        _payAllExcept(s, t1);         // r2: t1 misses
        _warpPastGrace(s);
        s.settleRound(2);
        _payAllExcept(s, address(0)); // r3: t1 pays but never refills
        _payAllExcept(s, address(0)); // r4
        assertFalse(s.stoppedPaying(t1));
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_finishNeverRevertsWhenJarShort() public {
        Squad s = _active(3, C);
        _payAllExcept(s, address(0)); // r1
        _payAllExcept(s, address(0)); // r2
        // Simulate unrepaid fronting: the jar holds 1c less than the deposits it owes back.
        deal(address(token), address(s), token.balanceOf(address(s)) - C);
        _payAllExcept(s, address(0)); // r3 settles and finishes
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_getStateReturnsArrays() public {
        Squad s = _active(3, C);
        Squad.SquadView memory v = s.getState();
        assertEq(uint8(v.state), uint8(Squad.State.Active));
        assertEq(v.members.length, 3);
        assertEq(v.required[0], 2 * C);
        assertEq(v.currentRound, 1);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd contracts && forge test --match-contract SquadRoundsTest`
Expected: compile error, `Member "contribute" not found`.

- [ ] **Step 3: Add to `contracts/src/Squad.sol`**

Add the struct, events, and errors at the top of the contract. Add the functions at the end.

```solidity
    struct SquadView {
        State state;
        uint256 contribution;
        uint8 maxMembers;
        uint32 roundLength;
        uint32 grace;
        uint64 depositDeadline;
        uint64 roundDeadline;
        uint8 currentRound;
        address organizer;
        address[] members;
        uint256[] locked;
        uint256[] required;
        bool[] paidThisRound;
        bool[] stopped;
        uint8[] misses;
        uint8[] refillBy;
        uint256[] owed;
        bool countsForTrust;
        uint8 activeCount;
        uint256 totalLocked;
        uint64 settleableAfter;
    }

    event Contributed(address indexed member, uint8 round, bool late);
    event RoundSettled(uint8 round, address indexed collector, uint256 amount, address[] missed);
    event StoppedPaying(address indexed member);
    event Completed();

    error AlreadyPaid();
    error PastGrace();
    error MemberStoppedPaying();
    error TooEarly(uint64 settleableAfter);
    error RoundNotOpen(uint64 opensAt);
    error AlreadySettled();

    function contribute() external inState(State.Active) onlyMember {
        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();
        uint8 r = currentRound;
        if (paid[r][msg.sender]) revert AlreadyPaid();
        if (block.timestamp > settleableAfter()) revert PastGrace();
        // A round opens on schedule even when the previous one auto-settled early:
        // no paying ahead, so trust can't be farmed by racing through rounds in one block.
        if (block.timestamp < roundDeadline - roundLength) revert RoundNotOpen(roundDeadline - roundLength);
        token.safeTransferFrom(msg.sender, address(this), contribution);
        paid[r][msg.sender] = true;
        paidCount++;
        roundContributions += contribution;
        bool late = block.timestamp > roundDeadline;
        if (countsForTrust) trust.recordContribution(msg.sender, late);
        emit Contributed(msg.sender, r, late);
        if (paidCount == activeCount) _settle();
    }

    function refillDeposit() external inState(State.Active) onlyMember {
        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();
        if (locked[msg.sender] >= required[msg.sender]) revert NothingOwed();
        uint256 amt = required[msg.sender] - locked[msg.sender];
        _pullDeposit(msg.sender, amt);
        refillBy[msg.sender] = 0;
        emit DepositLocked(msg.sender, amt);
    }

    /// Timestamp after which settleRound works even if not everyone has paid.
    function settleableAfter() public view returns (uint64) {
        return roundDeadline + grace;
    }

    /// Anyone may call. `round` makes repeated cron calls safe.
    function settleRound(uint8 round) external {
        if (state == State.Completed || (state == State.Active && round < currentRound)) revert AlreadySettled();
        if (state != State.Active) revert WrongState(state);
        if (round > currentRound) revert TooEarly(settleableAfter());
        if (paidCount < activeCount && block.timestamp <= settleableAfter()) revert TooEarly(settleableAfter());
        _settle();
    }

    function _settle() internal {
        uint8 r = currentRound;
        uint256 n = members.length;
        uint256 c = contribution;
        uint256 payout = roundContributions;
        address[] memory missed = new address[](n);
        uint256 mc;

        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (paid[r][m]) continue;
            // Stopped paying = still owes a refill from an earlier miss AND missed again.
            if (!stoppedPaying[m] && refillBy[m] != 0 && refillBy[m] <= r && locked[m] < required[m]) {
                _stop(m, r, n);
            }
            missed[mc++] = m;
            if (!stoppedPaying[m]) {
                if (countsForTrust) trust.recordMiss(m);
                missCount[m]++;
                refillBy[m] = r + 1;
                payout += _cover(m, c, turnOf[m] >= r);
            } else if (turnOf[m] >= r) {
                payout += _cover(m, c, true);
            } else {
                uint256 cap = r == n ? c : (coverPerRound[m] < c ? coverPerRound[m] : c);
                payout += _cover(m, cap, false);
            }
        }

        address collector = members[r - 1];
        uint256 gross = payout;
        uint256 repay = owed[collector] < gross ? owed[collector] : gross;
        if (repay > 0) {
            owed[collector] -= repay;
            frontedTotal -= repay;
            gross -= repay;
        }
        if (stoppedPaying[collector]) {
            uint256 w = c * (n - r);
            if (w > gross) w = gross;
            locked[collector] += w;
            totalLocked += w;
            gross -= w;
            coverPerRound[collector] = c;
        }

        roundContributions = 0;
        paidCount = 0;
        if (gross > 0) token.safeTransfer(collector, gross);

        address[] memory missedList = new address[](mc);
        for (uint256 i; i < mc; i++) missedList[i] = missed[i];
        emit RoundSettled(r, collector, gross, missedList);

        if (r == n) {
            _finish();
        } else {
            currentRound = r + 1;
            uint64 next = roundDeadline + roundLength;
            if (next <= block.timestamp) next = uint64(block.timestamp) + roundLength;
            roundDeadline = next;
        }
    }

    /// Free jar money that is not already fronted out. Covers and fronts both spend it,
    /// so a settle can never promise more than the jar actually holds.
    function _headroom() internal view returns (uint256) {
        return totalLocked > frontedTotal ? totalLocked - frontedTotal : 0;
    }

    /// Takes up to `amount` from m's deposit; optionally fronts the rest from jar liquidity.
    function _cover(address m, uint256 amount, bool canFront) internal returns (uint256 added) {
        uint256 cov = locked[m] < amount ? locked[m] : amount;
        uint256 h = _headroom();
        if (cov > h) cov = h;
        locked[m] -= cov;
        totalLocked -= cov;
        added = cov;
        if (canFront && cov < amount) {
            h = _headroom();
            uint256 f = amount - cov < h ? amount - cov : h;
            frontedTotal += f;
            owed[m] += f;
            added += f;
        }
    }

    function _stop(address m, uint8 r, uint256 n) internal {
        if (countsForTrust) trust.recordMiss(m); // the stopping round is a miss too
        stoppedPaying[m] = true;
        activeCount--;
        if (turnOf[m] < r) coverPerRound[m] = locked[m] / (n - r + 1);
        emit StoppedPaying(m);
    }

    /// Ends the squad. Pays only from what the jar actually holds, so it can never revert:
    /// if unrepaid fronting left the jar short, refunds are scaled down pro rata.
    function _finish() internal {
        uint256 n = members.length;
        uint256 sumKept; // deposits owed back to members still paying
        uint256 honest;
        address lastPayer;
        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (stoppedPaying[m]) {
                totalLocked -= locked[m]; // forfeited; stays in the jar for the honest pool
                locked[m] = 0;
            } else {
                sumKept += locked[m];
                lastPayer = m;
                if (missCount[m] == 0) honest++;
            }
        }
        state = State.Completed;
        frontedTotal = 0;

        uint256 avail = token.balanceOf(address(this));
        uint256 pool = avail > sumKept ? avail - sumKept : 0; // forfeits net of unrepaid fronting
        uint256 share = honest > 0 ? pool / honest : 0;

        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (stoppedPaying[m]) continue;
            uint256 amt = locked[m];
            locked[m] = 0;
            totalLocked -= amt;
            if (avail < sumKept) amt = (amt * avail) / sumKept;
            if (missCount[m] == 0) {
                amt += share;
                if (countsForTrust) trust.recordCompleted(m);
            }
            if (amt > 0) token.safeTransfer(m, amt);
        }
        uint256 dust = token.balanceOf(address(this));
        if (dust > 0) token.safeTransfer(lastPayer != address(0) ? lastPayer : members[n - 1], dust);
        emit Completed();
    }

    function getState() external view returns (SquadView memory v) {
        uint256 n = members.length;
        v.state = state;
        v.contribution = contribution;
        v.maxMembers = maxMembers;
        v.roundLength = roundLength;
        v.grace = grace;
        v.depositDeadline = depositDeadline;
        v.roundDeadline = roundDeadline;
        v.currentRound = currentRound;
        v.organizer = organizer;
        v.members = new address[](n);
        v.locked = new uint256[](n);
        v.required = new uint256[](n);
        v.paidThisRound = new bool[](n);
        v.stopped = new bool[](n);
        v.misses = new uint8[](n);
        v.refillBy = new uint8[](n);
        v.owed = new uint256[](n);
        v.countsForTrust = countsForTrust;
        v.activeCount = activeCount;
        v.totalLocked = totalLocked;
        v.settleableAfter = settleableAfter();
        for (uint256 i; i < n; i++) {
            address m = members[i];
            v.members[i] = m;
            v.locked[i] = locked[m];
            v.required[i] = required[m];
            v.paidThisRound[i] = paid[currentRound][m];
            v.stopped[i] = stoppedPaying[m];
            v.misses[i] = missCount[m];
            v.refillBy[i] = refillBy[m];
            v.owed[i] = owed[m];
        }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract SquadRoundsTest -vv`
Expected: 19 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).

- [ ] **Step 5: Run the full suite**

Run: `cd contracts && forge test`
Expected: 60 tests pass (5 token + 8 registry + 8 factory + 20 setup + 19 rounds).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/Squad.sol contracts/test/SquadRounds.t.sol
git commit -m "feat(contracts): contributions, settlement, deposits covering misses, end of squad"
```

---

### Task 5: Balance conservation invariant

**Files:**
- Create: `contracts/test/Invariant.t.sol`

**Interfaces:**
- Consumes: everything in `Squad`.

- [ ] **Step 1: Write the invariant test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

contract Handler is Test {
    Squad public s;
    AjoNGN public token;

    constructor(Squad _s, AjoNGN _token) {
        s = _s;
        token = _token;
    }

    function contribute(uint256 who) external {
        if (s.state() != Squad.State.Active) return;
        address m = s.memberAt(who % s.memberCount());
        if (s.stoppedPaying(m) || s.paid(s.currentRound(), m)) return;
        if (block.timestamp > uint256(s.roundDeadline()) + s.grace()) return;
        if (block.timestamp < uint256(s.roundDeadline()) - s.roundLength()) return; // round not open yet
        vm.prank(m);
        s.contribute();
    }

    function refill(uint256 who) external {
        if (s.state() != Squad.State.Active) return;
        address m = s.memberAt(who % s.memberCount());
        if (s.stoppedPaying(m) || s.locked(m) >= s.required(m)) return;
        vm.prank(m);
        s.refillDeposit();
    }

    function skipAndSettle(uint256 secs) external {
        if (s.state() != Squad.State.Active) return;
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
        if (block.timestamp <= uint256(s.roundDeadline()) + s.grace()) return;
        s.settleRound(s.currentRound());
    }

    /// Lets time pass with nobody paying, so members miss, fail to refill, and get stopped.
    function idle(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 15 minutes));
    }
}

contract InvariantTest is Test {
    AjoNGN token;
    TrustRegistry registry;
    SquadFactory factory;
    Squad s;
    Handler handler;

    /// 6 members at ₦1000 (counts for trust); m0 and m1 are Reliable, so capped deposits,
    /// coverPerRound, and fronting paths all get exercised.
    function setUp() public {
        token = new AjoNGN();
        registry = new TrustRegistry(address(this));
        factory = new SquadFactory(token, registry);
        registry.setWriter(address(factory), true);
        bytes32 code = keccak256("invite-code");
        bytes32 invite = keccak256(abi.encode(code));
        address[] memory us = new address[](6);
        for (uint256 i; i < 6; i++) {
            us[i] = makeAddr(string.concat("m", vm.toString(i)));
            vm.prank(us[i]);
            token.faucet(200_000e18);
        }
        address dummy = factory.createSquad(1000e18, 3, SquadFactory.Period.Demo, invite, 0);
        vm.startPrank(dummy);
        for (uint256 i; i < 20; i++) {
            registry.recordContribution(us[0], false);
            registry.recordContribution(us[1], false);
        }
        vm.stopPrank();
        vm.prank(us[0]);
        s = Squad(factory.createSquad(1000e18, 6, SquadFactory.Period.Demo, invite, 0));
        for (uint256 i; i < 6; i++) {
            vm.startPrank(us[i]);
            token.approve(address(s), type(uint256).max);
            if (i > 0) s.join(code);
            vm.stopPrank();
        }
        vm.prank(us[0]);
        s.start();
        for (uint256 i; i < 6; i++) {
            address m = s.memberAt(i);
            vm.prank(m);
            s.lockDeposit();
        }
        handler = new Handler(s, token);
        targetContract(address(handler));
    }

    function invariant_jarBalanceMatchesAccounting() public view {
        uint256 bal = token.balanceOf(address(s));
        if (s.state() == Squad.State.Completed) {
            assertEq(bal, 0);
        } else {
            assertEq(bal, s.totalLocked() - s.frontedTotal() + s.roundContributions());
        }
    }

    function invariant_frontingNeverExceedsDeposits() public view {
        if (s.state() == Squad.State.Active) assertLe(s.frontedTotal(), s.totalLocked());
    }
}
```

- [ ] **Step 2: Run it**

Run: `cd contracts && forge test --match-contract InvariantTest`
Expected: 2 invariants pass across 256 runs × depth 60, with `fail_on_revert = true` (any unexpected revert in `settleRound` or `_finish` fails the run). If one fails, forge prints the call sequence. Fix `_settle` or `_cover` in `Squad.sol`, not the test.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/Invariant.t.sol
git commit -m "test(contracts): jar balance conservation invariant"
```

---

### Task 6: Deploy (local and Monad testnet), ABIs, and contracts README

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `contracts/script/export-abi.sh`, `contracts/.env.example`, `contracts/README.md`, `contracts/deployments/31337.json` (local, gitignored), `contracts/deployments/10143.json`, `contracts/abi/*.json`
- Modify: `.gitignore` (add `contracts/deployments/31337.json`)

**Interfaces:**
- Produces:
  - `contracts/deployments/<chainId>.json`, written by the script itself, shaped as `{"chainId":10143,"token":"0x…","registry":"0x…","factory":"0x…","deployBlock":N}`
  - `contracts/abi/{AjoNGN,TrustRegistry,SquadFactory,Squad}.json`
  - The error catalogue in `contracts/README.md`, which Plan 2 maps to user-facing copy

- [ ] **Step 1: Write `contracts/script/Deploy.s.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract Deploy is Script {
    // Anvil's well-known account #0. Only ever used for chain 31337.
    uint256 constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        uint256 key = block.chainid == 31337 ? ANVIL_KEY : vm.envOr("DEPLOYER_KEY", uint256(0));
        require(key != 0, "DEPLOYER_KEY missing: copy contracts/.env.example to contracts/.env and fill it");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        AjoNGN token = new AjoNGN();
        TrustRegistry registry = new TrustRegistry(deployer);
        SquadFactory factory = new SquadFactory(token, registry);
        registry.setWriter(address(factory), true);
        vm.stopBroadcast();

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "token", address(token));
        vm.serializeAddress(obj, "registry", address(registry));
        vm.serializeAddress(obj, "factory", address(factory));
        string memory json = vm.serializeUint(obj, "deployBlock", block.number);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("token", address(token));
        console2.log("registry", address(registry));
        console2.log("factory", address(factory));
        console2.log("wrote", path);
    }
}
```

- [ ] **Step 2: Write `contracts/.env.example`**

```bash
# Testnet-only key. Create one with: cast wallet new
# Fund it with testnet MON from the Monad testnet faucet (linked from https://docs.monad.xyz).
# Never put a mainnet key here.
DEPLOYER_KEY=
```

- [ ] **Step 3: Deploy locally (no key, no faucet needed)**

```bash
cd contracts
mkdir -p deployments
anvil --silent &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cat deployments/31337.json
```

Expected: the JSON contains `chainId` 31337 and three addresses. Add `contracts/deployments/31337.json` to `.gitignore`. Plan 2 uses this local path for development and E2E tests. It uses `cast rpc evm_increaseTime` instead of waiting 300s per round.

- [ ] **Step 4: Fund the testnet deployer (human step)**

Run `cast wallet new`, then put the private key in `contracts/.env` (gitignored). Fund it from the Monad testnet faucet.

- [ ] **Step 5: Deploy and verify on Monad testnet**

```bash
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast \
  --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org
```

Expected:
- The log prints `token`, `registry`, `factory`, and `wrote deployments/10143.json`.
- If verification fails, the deployment still stands. Rerun only verification with `forge verify-contract <address> <Contract> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`.

- [ ] **Step 6: Smoke test onchain**

```bash
F=$(jq -r .factory deployments/10143.json); R=$(jq -r .registry deployments/10143.json)
cast call $F "timing(uint8)(uint32,uint32,uint32)" 0 --rpc-url monad_testnet
cast call $R "isWriter(address)(bool)" $F --rpc-url monad_testnet
cast block latest --field mixHash --rpc-url monad_testnet
cast block $(( $(cast block-number --rpc-url monad_testnet) - 1 )) --field mixHash --rpc-url monad_testnet
```

Expected:
- `300 60 300`.
- `true`.
- Two **different** hashes. `mixHash` is what `block.prevrandao` returns. If both are identical or zero, add "turn-order randomness: prevrandao constant on Monad testnet" to `TODOS.md`. This does not block the demo.

- [ ] **Step 7: Write `contracts/script/export-abi.sh` and run it**

```bash
#!/usr/bin/env bash
# Regenerates the ABIs the app imports. Run after any contract change.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p abi
for c in AjoNGN TrustRegistry SquadFactory Squad; do
  forge inspect "$c" abi --json > "abi/$c.json"
done
echo "ABIs written to contracts/abi/"
```

```bash
chmod +x contracts/script/export-abi.sh && contracts/script/export-abi.sh
```

Expected: 4 files in `contracts/abi/`.

- [ ] **Step 8: Write `contracts/README.md`**

````markdown
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
| `start()` | organizer | Open |
| `lockDeposit()` | member | Depositing |
| `finalizeDeposits()` | anyone, after `depositDeadline` | Depositing |
| `contribute()` / `refillDeposit()` | member | Active |
| `settleRound(round)` | anyone; after `settleableAfter()` or once all have paid | Active |
| `getState()` | view | any |

Invite hash (viem): `keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]))`, where `code` is a random 32 bytes carried in the invite link. The code is visible onchain after the first join, so invite-only stops casual joins, not determined ones.

Enums in the ABI: `Period` 0 Demo, 1 Weekly, 2 Monthly. `State` 0 Open, 1 Depositing, 2 Active, 3 Completed, 4 Cancelled. `tier()` 0 New, 1 Building, 2 Reliable.

## Error catalogue

| Error | Cause | What the user should do |
|---|---|---|
| `ContributionTooLow(min)` | Contribution under ₦100 | Pick at least ₦100 |
| `SizeOutOfRange(min, max)` | Squad size outside 3 to 20 | Pick 3 to 20 people |
| `EmptyInvite()` | App sent no invite hash | App bug: generate a code |
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
| `NotWriter()` / `NotSquad()` | Registry access control | Deployment bug |
````

- [ ] **Step 9: Commit**

```bash
git add .gitignore contracts/script contracts/.env.example contracts/README.md contracts/deployments/10143.json contracts/abi
git commit -m "chore(contracts): local and testnet deploy, ABI export, README with error catalogue"
git push
```

---

## After this plan

- **Plan 2 (app + settlement)** starts with the Privy sponsorship and server-wallet spike, and is written after it. It covers spec child issues #3, #4, #5.
- **Plan 3 (Kimi)** covers child issue #6.

<!-- autoplan-accepted:ceo -->
- AjoNGN inherits ERC20Permit; test_permitSetsAllowance passes.
- TrustRegistry owns trust records; owner-only setWriter; writer-only registerSquad; squad-only record functions; history survives a new factory (test_historySurvivesNewFactory).
- Squads write trust only when activated with n >= 5 and c >= 1000e18 (countsForTrust); 3-member squads record nothing.
- createSquad takes bytes32 inviteHash (non-zero); join(bytes32 code) reverts BadInvite unless keccak256(abi.encode(code)) == inviteHash.
- Factory emits Membership(member, squad, joined) on create, join, leave and drop.
- A member is marked stopped paying only when a refill is overdue AND they missed the current round (test_payingMemberWithLowDepositNotStopped).
- _finish pays from the actual jar balance, pro rata when short, and never reverts; dust goes to the last member still paying (test_finishNeverRevertsWhenJarShort).
- Invariant suite uses fail_on_revert = true, a 6-member squad with two Reliable members, and an idle warp action.
- Deploy smoke test checks registry isWriter and that prevrandao (mixHash) differs between consecutive blocks; if constant, record in TODOS.md.
- Plan test counts: 5 token, 6 registry, 7 factory, 16 setup, 18 rounds, 52 total.
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:dx -->
- Task 1 scaffolds with `forge init contracts --no-git --no-deps` and checks `git submodule status` lists forge-std and openzeppelin-contracts; foundry.toml pins evm_version cancun and grants fs_permissions read-write on ./deployments.
- TrustRegistry uses OZ Ownable2Step (transferOwnership + acceptOwnership) with NEW/BUILDING/RELIABLE constants; tests test_onlyOwnerSetsWriters (OwnableUnauthorizedAccount) and test_ownershipTransfersInTwoSteps.
- SquadFactory reverts ContributionTooLow(100e18), SizeOutOfRange(3, 20), EmptyInvite() instead of BadParams.
- Squad: WrongState(State current); TooEarly(uint64 settleableAfter) with public settleableAfter() = roundDeadline + grace; dropped organizer cannot cancel; joinWithPermit(code, deadline, v, r, s) grants max allowance and joins (test_joinWithPermitApprovesAndJoins); _requiredDepositFor internal; lockDeposit/refillDeposit revert NothingOwed when locked >= required; _settle local renamed payout.
- getState adds refillBy[], owed[], countsForTrust, activeCount, totalLocked, settleableAfter.
- Deploy.s.sol uses the anvil key on chain 31337, requires DEPLOYER_KEY otherwise, and writes deployments/<chainId>.json itself; Task 6 adds local anvil deploy, Sourcify verify, export-abi.sh, and contracts/README.md with lifecycle, invite-hash recipe, enum ordinals and full error catalogue.
- Test counts supersede CEO block: 5 token, 7 registry, 7 factory, 17 setup, 18 rounds, 54 total.
<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->
- Squad.contribute reverts RoundNotOpen(roundDeadline - roundLength) before a round opens; test_cannotPayAheadAfterEarlyAutoSettle; test helpers and the invariant handler warp or skip until the round opens.
- TrustRegistry stores factoryOf[squad]; isSquad(squad) is a view returning isWriter[factoryOf[squad]]; revoking a factory blocks its squads (test_revokedFactorySquadsCannotWrite).
- _stop records a miss when countsForTrust.
- Organizer remove(address) while Open via shared _removeMember (test_organizerRemovesMemberWhileOpen).
- Reliable cap decided at start (cappedAtStart); finalizeDeposits always activates after drops; dead re-open branch removed.
- README error catalogue adds RoundNotOpen(opensAt).
- Test counts supersede earlier blocks: 5 token, 8 registry, 7 factory, 18 setup, 19 rounds, 57 tests plus 2 invariants.
<!-- /autoplan-accepted:eng -->
## Review record

### Phase 1: CEO review (mode: SELECTIVE EXPANSION, auto-decided)

**System audit.** The repo is greenfield: `CONTEXT.md`, `docs/designs/ajo-circles.md`, the spec, and this plan. There is no code, no TODOS.md, and no CLAUDE.md. The design doc and spec are the source of truth. This plan covers child issue #2 (contracts) of epic #1. UI scope: none in this plan.

**0A Premise challenge.**
1. "Collateral plus automatic payout is the product" (design premise 3). **Challenged.** With full collateral, turn 1 locks `(n-1)c` and collects `nc`, so a New-tier member gets no credit, only forced saving. Only Reliable members get credit, through the 3c cap. The premise holds only if the pitch says plainly: New = safe forced savings, Reliable = earned credit. → Queued for the Final Gate as a premise item.
2. "Trust score is the moat" (premise 5). **Valid only after fixes.** As drafted, the score could be farmed (Demo squads, 3 members, ₦100) and was wiped on every factory redeploy. Both are fixed below (trust gate, `TrustRegistry`).
3. "Testnet with simulated top-up is acceptable." Valid; nothing in this plan contradicts it.

**0B What already exists.** No repo code. Reused: OpenZeppelin ERC20, ERC20Permit, SafeERC20, and forge-std. Nothing is rebuilt.

**0C Dream state.**
```
CURRENT                         THIS PLAN                                 12-MONTH IDEAL
docs only, no contracts  --->   testnet jar contracts, trust registry --> mainnet stablecoin (cNGN) jars,
                                that survives redeploys, invite-only      portable trust that unlocks credit
                                squads, permit token                      (vouching, uncollateralized slots)
```
This plan moves toward the ideal. The registry split and permit token are what keep that path open.

**0C-bis Alternatives.**
- A, as drafted (factory holds trust): S effort, Med risk. Cheapest, but trust resets on redeploy.
- B, separate `TrustRegistry` plus invite-only plus permit: S to M effort, Low risk. Keeps reputation portable. **Chosen (P1).**
- C, social vouching (members back each other instead of self-deposits): L effort, High risk. Deferred; it's the 12-month credit story, not a 12-day build.

**0F Mode.** SELECTIVE EXPANSION (autoplan override).

**0D Selective expansion candidates.**

| # | Candidate | Decision | Principle |
|---|---|---|---|
| 1 | `TrustRegistry` split | Accepted, in blast radius, under 1 day | P1, P2 |
| 2 | Invite-hash join | Accepted | P1 |
| 3 | `ERC20Permit` | Accepted | P2 |
| 4 | Per-user `Membership` events | Accepted | P2 |
| 5 | Social vouching | Deferred (L effort, outside radius) | P3 |
| 6 | Commit-reveal turn order | Deferred to TODOS; replaced by a day-1 prevrandao check | P3 |

**0E Temporal interrogation.**
- Hour 1: where trust lives. Resolved with the registry.
- Hours 2-3: stop semantics (miss once, then pay). Resolved: a member is stopped only when a refill is overdue AND they miss again.
- Hours 4-5: whether `_finish` can revert. Resolved: it pays out of the real balance, pro rata.
- Hour 6+: whether the invariant actually reaches the risky paths. Resolved: Reliable members, an idle action, and `fail_on_revert`.

**Section 1, Architecture.**
```
AjoNGN (ERC20Permit) <──transfers── Squad (one per group) ──trust r/w──> TrustRegistry (owner allowlists)
                                       │  ▲ registerSquad                       ▲ setWriter
                                       │  └──────────── SquadFactory ───────────┘
                                       └──noteMembership──> SquadFactory ──emits Membership(member, squad)
Squad states: Open ─start→ Depositing ─allLocked→ Active ─round n settled→ Completed
              Open|Depositing ─cancel / finalize with <3 members→ Cancelled   (no other transitions)
```
Findings: trust was coupled to the factory, which a redeploy would reset (fixed, registry). A single point of failure remains: the relayer that calls `settleRound` is off-chain, but `settleRound` is permissionless, so any member can call it. Rollback is a redeploy of the factory plus re-allowlisting.

**Section 2, Error & Rescue Registry.**

| Codepath | Failure | Error | Rescued? | User sees |
|---|---|---|---|---|
| `join` | wrong code, full, already a member | `BadInvite` / `Full` / `AlreadyMember` | revert | app shows "invite invalid / squad full" |
| `start` | under 3 members, not organizer | `TooFewMembers` / `NotOrganizer` | revert | button disabled |
| `lockDeposit` | nothing owed, no allowance | `NothingOwed` / ERC20 error | revert | app pre-checks allowance (Plan 2) |
| `finalizeDeposits` | too early | `DepositWindowOpen` | revert | cron retries |
| `contribute` | paid, past grace, stopped | `AlreadyPaid` / `PastGrace` / `MemberStoppedPaying` | revert | app state reflects it |
| `settleRound` | early, duplicate | `TooEarly` / `AlreadySettled` | revert, idempotent for cron | none |
| `_finish` | jar short from unrepaid fronting | was a revert that locked funds (**CRITICAL GAP**) | **fixed**: pro rata from the real balance | smaller refund, never stuck |

**Section 3, Security.**
- Trust farming: High likelihood, High impact. Mitigated by the n ≥ 5, c ≥ ₦1000 gate; residual farming with fake accounts is a named testnet limitation.
- Open join and griefing: Med/Med. Mitigated by the invite hash. Residual: the code is visible in calldata after the first join (Low).
- Organizer grinding turn order through `start()` timing: Med/Low. Deferred to TODOS plus the day-1 prevrandao check.
- Reentrancy: none; `AjoNGN` has no hooks and state is set before transfers.
- Registry owner key: a single EOA (testnet). Deferred.

**Section 4, Data flow and edge cases.** The settle path traced: contributions → covers (capped by headroom) → fronts → repay → withhold → transfer. The empty-round case (nobody pays) is covered by `test_lateSettleSchedulesFutureDeadline`. The double-settle case is covered by `AlreadySettled`. Contract calls can't interleave inside one transaction, so there is no async ordering issue in this plan; cron double-calls are idempotent.

**Section 5, Code quality.**
- `_settle` branches more than 5 ways. Accepted, because the branches mirror spec settlement rules 1-4 one-for-one; a comment maps them.
- Test counts were wrong (fixed: 52).
- The `_stop` rule was too harsh (fixed).

**Section 6, Tests.**
- New paths covered: trust gate, invite, permit, registry access control, the pro-rata finish, and the stop rule.
- Gap fixed: the invariant previously never reached capped deposits or deficits.
- Chaos test: the invariant with idle warps and `fail_on_revert`.

**Section 7, Performance.** Loops are bounded at n ≤ 20; the worst case is `_settle` with 20 members and 3 external calls each (trust writes). That fits Monad's block gas comfortably. No issues.

**Section 8, Observability.** Every state change emits an event (`RoundSettled` includes the list of members who missed; there's also `StoppedPaying` and `Membership`). The app reads `getState`. No issues; the off-chain alerting for the relayer belongs to Plan 2.

**Section 9, Deployment.** The deploy order is token → registry → factory → `setWriter`, and is scripted. Smoke checks were added (`isWriter`, prevrandao). Rollback: deploy a new factory, `setWriter(old,false)`, then `setWriter(new,true)`.

**Section 10, Trajectory.** Reversibility 2/5 (the contracts are immutable; the registry makes the reputation reversible-safe). Debt: the single-owner registry, prevrandao, and the testnet token.

**NOT in scope.** Social vouching or uncollateralized credit; commit-reveal ordering; multisig registry owner; mainnet cNGN; the app (Plan 2); Kimi (Plan 3).

**Dream state delta.** After this plan we have trustworthy jar mechanics and portable reputation on testnet. Still missing for the ideal: real money, and credit that isn't backed by the member's own deposit.

**CEO DUAL VOICES: CONSENSUS TABLE** `[subagent-only]` (Codex not installed)
```
  Dimension                             Claude-sub  Codex  Consensus
  1. Premises valid?                    NO (#1)     N/A    N/A
  2. Right problem?                     YES         N/A    N/A
  3. Scope calibration?                 adjust      N/A    N/A
  4. Alternatives explored?             NO          N/A    N/A
  5. Competitive risks covered?         NO          N/A    N/A
  6. 6-month trajectory sound?          NO (#5)     N/A    N/A
```

**Completion Summary (CEO).**
- Mode: SELECTIVE EXPANSION.
- Section 1: 1 issue. Section 2: 7 paths mapped, 1 critical gap (fixed). Section 3: 5 threats, 2 High (mitigated). Section 4: 3 edge cases mapped. Section 5: 3 issues. Section 6: 1 gap (fixed). Sections 7 and 8: 0 issues. Section 9: 1 risk. Section 10: reversibility 2/5.
- Scope proposals: 6 proposed, 4 accepted, 2 deferred.
- Outside voice: Codex unavailable (not installed), Claude subagent completed with 12 findings.
- Unresolved: 1 premise item, queued to the gate.

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"9372644bf96477bb52176a2026a1996ca2e112034acbe9cb6496aaec788c4738","replacements":[{"oldText":"- `SquadFactory` deploys one `Squad` per group and is the only writer of the global trust record.\n- `Squad` is a state machine (Open, Depositing, Active, Completed, Cancelled) that holds the jar.\n- All money moves are ERC-20 transfers of `AjoNGN`, which has no hooks.\n","newText":"- `TrustRegistry` holds the global trust record and outlives any factory. Its owner allowlists factories, and factories register the squads they create, which are then the only writers.\n- `SquadFactory` deploys one `Squad` per group, registers it with the registry, and emits per-user `Membership` events for the app.\n- `Squad` is a state machine (Open, Depositing, Active, Completed, Cancelled) that holds the jar. It is invite-only through a hashed invite code.\n- All money moves are ERC-20 transfers of `AjoNGN` (ERC20Permit, no hooks).\n"},{"oldText":"- `recordCompleted` only when `n >= 5` and `c >= 1000e18`, and only for members with zero misses who did not stop paying.\n- Contracts are not upgradeable. Fixes mean redeploying.\n","newText":"- A squad writes trust (on-time, late, missed, completed) only if it activated with `n >= 5` and `c >= 1000e18`. Smaller squads write nothing. `completed` is credited only to members with zero misses who did not stop paying.\n- Contracts are not upgradeable. Fixing a squad or factory bug means deploying a new factory and allowlisting it in the existing `TrustRegistry`, so trust history survives.\n- `_finish` must never revert. Refunds are paid from the jar's actual balance (pro rata when short).\n"},{"oldText":"5. `contribute` called by a member after they were marked stopped paying: it reverts and doesn't double count (test: `test_stoppedMemberCannotContribute`).\n\n","newText":"5. `contribute` called by a member after they were marked stopped paying: it reverts and doesn't double count (test: `test_stoppedMemberCannotContribute`).\n6. Fronted money not fully repaid by the end of the squad: `_finish` still completes and empties the jar (test: `test_finishNeverRevertsWhenJarShort`; invariant runs with `fail_on_revert = true`).\n7. A member who missed once, didn't refill, but keeps paying every round: they are not marked stopped paying (test: `test_payingMemberWithLowDepositNotStopped`).\n\n"},{"oldText":"| `contracts/src/ITrust.sol` | Interface the squad uses to read and write trust |\n| `contracts/src/SquadFactory.sol` | Creates squads, timing presets, trust records |\n","newText":"| `contracts/src/ITrust.sol` | `ITrust` (read/write trust) and `IMembership` (membership events) interfaces |\n| `contracts/src/TrustRegistry.sol` | Portable trust records; owner allowlists factories |\n| `contracts/src/SquadFactory.sol` | Creates squads, timing presets, per-user `Membership` events |\n"},{"oldText":"| `contracts/test/SquadFactory.t.sol` | Factory and trust tests |\n","newText":"| `contracts/test/TrustRegistry.t.sol` | Registry access control and trust math |\n| `contracts/test/SquadFactory.t.sol` | Factory tests |\n"},{"oldText":"depth = 60\n\n","newText":"depth = 60\nfail_on_revert = true\n\n"},{"oldText":"        token.faucet(200_000e18 + 1);\n    }\n}\n```\n","newText":"        token.faucet(200_000e18 + 1);\n    }\n\n    function test_permitSetsAllowance() public {\n        (address owner, uint256 key) = makeAddrAndKey(\"owner\");\n        address spender = makeAddr(\"spender\");\n        uint256 deadline = block.timestamp + 1 hours;\n        bytes32 structHash = keccak256(\n            abi.encode(\n                keccak256(\"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)\"),\n                owner, spender, type(uint256).max, token.nonces(owner), deadline\n            )\n        );\n        bytes32 digest = keccak256(abi.encodePacked(\"\\x19\\x01\", token.DOMAIN_SEPARATOR(), structHash));\n        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);\n        token.permit(owner, spender, type(uint256).max, deadline, v, r, s);\n        assertEq(token.allowance(owner, spender), type(uint256).max);\n    }\n}\n```\n"},{"oldText":"import {ERC20} from \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\n\n","newText":"import {ERC20} from \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\nimport {ERC20Permit} from \"@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol\";\n\n"},{"oldText":"contract AjoNGN is ERC20 {\n","newText":"/// Permit lets the app approve a squad with a signature instead of a separate transaction.\ncontract AjoNGN is ERC20, ERC20Permit {\n"},{"oldText":"    constructor() ERC20(\"Squadjar Naira\", \"sNGN\") {}\n","newText":"    constructor() ERC20(\"Squadjar Naira\", \"sNGN\") ERC20Permit(\"Squadjar Naira\") {}\n"},{"oldText":"Expected: 4 tests pass.\n","newText":"Expected: 5 tests pass.\n"},{"oldText":"git commit -m \"feat(contracts): add AjoNGN test naira with capped faucet\"\n","newText":"git commit -m \"feat(contracts): add AjoNGN test naira with capped faucet and permit\"\n"},{"oldText":"### Task 2: Factory, trust records, and the squad's Open phase\n","newText":"### Task 2: Trust registry, factory, and the squad's Open phase\n"},{"oldText":"- Create: `contracts/src/ITrust.sol`, `contracts/src/SquadFactory.sol`, `contracts/src/Squad.sol`, `contracts/test/Base.t.sol`, `contracts/test/SquadFactory.t.sol`, `contracts/test/SquadSetup.t.sol`\n","newText":"- Create: `contracts/src/ITrust.sol`, `contracts/src/TrustRegistry.sol`, `contracts/src/SquadFactory.sol`, `contracts/src/Squad.sol`, `contracts/test/Base.t.sol`, `contracts/test/TrustRegistry.t.sol`, `contracts/test/SquadFactory.t.sol`, `contracts/test/SquadSetup.t.sol`\n"},{"oldText":"  - `SquadFactory(IERC20 token)`\n  - `enum Period { Demo, Weekly, Monthly }`\n  - `createSquad(uint256 contribution, uint8 maxMembers, Period period) returns (address)`\n  - `timing(Period) pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow)`\n  - `isSquad(address) returns (bool)`\n  - `records(address) returns (uint32 onTime, uint32 late, uint32 missed, uint32 completed)`\n  - `trustScore(address) returns (int256)`\n  - `tier(address) returns (uint8)`\n  - `recordContribution(address,bool)`, `recordMiss(address)`, `recordCompleted(address)`, all `onlySquad`\n  - `Squad`: `enum State { Open, Depositing, Active, Completed, Cancelled }`, `join()`, `leave()`, `cancel()`, `memberCount()`, `memberAt(uint256)`, `isMember(address)`, `organizer()`, `state()`\n  - Errors: `WrongState()`, `NotOrganizer()`, `NotMember()`, `AlreadyMember()`, `Full()`, `OrganizerCannotLeave()`\n","newText":"  - `ITrust`: `trustScore(address) view returns (int256)`, `tier(address) view returns (uint8)`, `recordContribution(address,bool)`, `recordMiss(address)`, `recordCompleted(address)`\n  - `IMembership`: `noteMembership(address member, bool joined)`\n  - `TrustRegistry(address owner)` implementing `ITrust`, plus:\n    - `setWriter(address factory, bool allowed)` (owner only)\n    - `registerSquad(address squad)` (writer factories only)\n    - `isWriter(address)`, `isSquad(address)`\n    - `records(address) returns (uint32 onTime, uint32 late, uint32 missed, uint32 completed)`\n  - `SquadFactory(IERC20 token, TrustRegistry registry)` implementing `IMembership`, plus:\n    - `enum Period { Demo, Weekly, Monthly }`\n    - `createSquad(uint256 contribution, uint8 maxMembers, Period period, bytes32 inviteHash) returns (address)`\n    - `timing(Period) pure returns (uint32,uint32,uint32)`\n    - `isSquad(address)`, `squadCount()`\n    - Event `Membership(address indexed member, address indexed squad, bool joined)`\n  - `Squad`:\n    - `enum State { Open, Depositing, Active, Completed, Cancelled }`\n    - `join(bytes32 code)`, `leave()`, `cancel()`\n    - Views: `memberCount()`, `memberAt(uint256)`, `isMember(address)`, `organizer()`, `state()`, `inviteHash()`\n    - Errors: `WrongState()`, `NotOrganizer()`, `NotMember()`, `AlreadyMember()`, `Full()`, `OrganizerCannotLeave()`, `BadInvite()`\n  - Invite hash convention: `inviteHash = keccak256(abi.encode(code))`, where `code` is a random `bytes32` the app puts in the invite link.\n"},{"oldText":"- [ ] **Step 1: Write `contracts/src/ITrust.sol`**\n","newText":"- [ ] **Step 1: Write the interfaces `contracts/src/ITrust.sol`**\n"},{"oldText":"    function recordCompleted(address member) external;\n}\n```\n\n","newText":"    function recordCompleted(address member) external;\n}\n\ninterface IMembership {\n    function noteMembership(address member, bool joined) external;\n}\n```\n\n"},{"oldText":"pragma solidity ^0.8.24;\n\nimport {Test} from \"forge-std/Test.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\nimport {Squad} from \"../src/Squad.sol\";\n\nabstract contract Base is Test {\n    AjoNGN token;\n    SquadFactory factory;\n    address[] users;\n","newText":"pragma solidity ^0.8.24;\n\nimport {Test} from \"forge-std/Test.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {TrustRegistry} from \"../src/TrustRegistry.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\nimport {Squad} from \"../src/Squad.sol\";\n\nabstract contract Base is Test {\n    AjoNGN token;\n    TrustRegistry registry;\n    SquadFactory factory;\n    address[] users;\n"},{"oldText":"    uint256 constant C = 1000e18;\n\n","newText":"    uint256 constant C = 1000e18;\n    bytes32 constant CODE = keccak256(\"invite-code\");\n    bytes32 constant INVITE = keccak256(abi.encode(CODE));\n\n"},{"oldText":"        factory = new SquadFactory(token);\n        for (uint256 i; i < 6; i++) {\n","newText":"        registry = new TrustRegistry(address(this));\n        factory = new SquadFactory(token, registry);\n        registry.setWriter(address(factory), true);\n        for (uint256 i; i < 8; i++) {\n"},{"oldText":"    /// users[0] organizes; users[1..n-1] join. Everyone approves the squad.\n","newText":"    /// users[0] organizes; users[1..n-1] join with the invite code. Everyone approves the squad.\n"},{"oldText":"        s = Squad(factory.createSquad(c, uint8(n), SquadFactory.Period.Demo));\n","newText":"        s = Squad(factory.createSquad(c, uint8(n), SquadFactory.Period.Demo, INVITE));\n"},{"oldText":"            s.join();\n","newText":"            s.join(CODE);\n"},{"oldText":"    /// Gives `u` a trust score of 20 (Reliable) through a throwaway squad.\n","newText":"    /// Gives `u` a trust score of 20 (Reliable) by writing as a registered squad.\n"},{"oldText":"        vm.prank(users[5]);\n        address dummy = factory.createSquad(C, 3, SquadFactory.Period.Demo);\n","newText":"        vm.prank(users[7]);\n        address dummy = factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE);\n"},{"oldText":"        for (uint256 i; i < 20; i++) factory.recordContribution(u, false);\n","newText":"        for (uint256 i; i < 20; i++) registry.recordContribution(u, false);\n"},{"oldText":"- [ ] **Step 3: Write the failing factory tests `contracts/test/SquadFactory.t.sol`**\n","newText":"- [ ] **Step 3: Write the failing registry tests `contracts/test/TrustRegistry.t.sol`**\n\n```solidity\n// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nimport {Base} from \"./Base.t.sol\";\nimport {TrustRegistry} from \"../src/TrustRegistry.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\n\ncontract TrustRegistryTest is Base {\n    function test_onlyOwnerSetsWriters() public {\n        vm.prank(users[1]);\n        vm.expectRevert(TrustRegistry.NotOwner.selector);\n        registry.setWriter(users[1], true);\n    }\n\n    function test_onlyWritersRegisterSquads() public {\n        vm.prank(users[1]);\n        vm.expectRevert(TrustRegistry.NotWriter.selector);\n        registry.registerSquad(users[1]);\n    }\n\n    function test_recordsOnlyFromRegisteredSquads() public {\n        vm.expectRevert(TrustRegistry.NotSquad.selector);\n        registry.recordMiss(users[1]);\n    }\n\n    function test_factoryRegistersItsSquads() public {\n        vm.prank(users[0]);\n        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n        assertTrue(registry.isSquad(s));\n    }\n\n    function test_historySurvivesNewFactory() public {\n        _makeReliable(users[2]);\n        SquadFactory factory2 = new SquadFactory(token, registry);\n        registry.setWriter(address(factory2), true);\n        registry.setWriter(address(factory), false);\n        assertEq(registry.trustScore(users[2]), 20);\n        vm.prank(users[0]);\n        address s = factory2.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n        assertTrue(registry.isSquad(s));\n    }\n\n    function test_trustScoreMathAndTiers() public {\n        vm.prank(users[7]);\n        address s = factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE);\n        address u = users[1];\n        assertEq(registry.tier(u), 0);\n        vm.startPrank(s);\n        for (uint256 i; i < 6; i++) registry.recordContribution(u, false); // +6\n        assertEq(registry.trustScore(u), 6);\n        assertEq(registry.tier(u), 1);\n        registry.recordContribution(u, true); // -2\n        registry.recordCompleted(u);          // +3\n        assertEq(registry.trustScore(u), 7);\n        registry.recordMiss(u);               // -10\n        assertEq(registry.trustScore(u), -3);\n        assertEq(registry.tier(u), 0);\n        vm.stopPrank();\n    }\n}\n```\n\n- [ ] **Step 4: Write the failing factory tests `contracts/test/SquadFactory.t.sol`**\n"},{"oldText":"contract SquadFactoryTest is Base {\n    function test_createSquadRegistersAndSetsOrganizer() public {\n","newText":"contract SquadFactoryTest is Base {\n    event Membership(address indexed member, address indexed squad, bool joined);\n\n    function test_createSquadRegistersAndSetsOrganizer() public {\n"},{"oldText":"        address s = factory.createSquad(C, 5, SquadFactory.Period.Weekly);\n","newText":"        address s = factory.createSquad(C, 5, SquadFactory.Period.Weekly, INVITE);\n"},{"oldText":"        assertEq(Squad(s).memberCount(), 1);\n        assertEq(Squad(s).roundLength(), 604800);\n","newText":"        assertEq(Squad(s).memberCount(), 1);\n        assertEq(Squad(s).inviteHash(), INVITE);\n        assertEq(Squad(s).roundLength(), 604800);\n"},{"oldText":"\n    function test_createSquadRejectsSmallContribution() public {\n","newText":"\n    function test_createEmitsOrganizerMembership() public {\n        vm.expectEmit(true, false, false, true, address(factory));\n        emit Membership(users[0], address(0), true);\n        vm.prank(users[0]);\n        factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n    }\n\n    function test_createSquadRejectsSmallContribution() public {\n"},{"oldText":"        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo);\n","newText":"        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo, INVITE);\n"},{"oldText":"        factory.createSquad(C, 2, SquadFactory.Period.Demo);\n","newText":"        factory.createSquad(C, 2, SquadFactory.Period.Demo, INVITE);\n"},{"oldText":"        factory.createSquad(C, 21, SquadFactory.Period.Demo);\n","newText":"        factory.createSquad(C, 21, SquadFactory.Period.Demo, INVITE);\n    }\n\n    function test_createSquadRejectsEmptyInvite() public {\n        vm.expectRevert(SquadFactory.BadParams.selector);\n        factory.createSquad(C, 5, SquadFactory.Period.Demo, bytes32(0));\n"},{"oldText":"    function test_recordsOnlyFromSquads() public {\n","newText":"    function test_noteMembershipOnlyFromSquads() public {\n"},{"oldText":"        factory.recordMiss(users[1]);\n    }\n\n    function test_trustScoreMathAndTiers() public {\n        vm.prank(users[5]);\n        address s = factory.createSquad(C, 3, SquadFactory.Period.Demo);\n        address u = users[1];\n        assertEq(factory.tier(u), 0);\n        vm.startPrank(s);\n        for (uint256 i; i < 6; i++) factory.recordContribution(u, false); // +6\n        assertEq(factory.trustScore(u), 6);\n        assertEq(factory.tier(u), 1);\n        factory.recordContribution(u, true); // -2\n        factory.recordCompleted(u);          // +3\n        assertEq(factory.trustScore(u), 7);\n        factory.recordMiss(u);               // -10\n        assertEq(factory.trustScore(u), -3);\n        assertEq(factory.tier(u), 0);\n        vm.stopPrank();\n","newText":"        factory.noteMembership(users[1], true);\n"},{"oldText":"- [ ] **Step 4: Write the failing Open-phase tests `contracts/test/SquadSetup.t.sol`**\n","newText":"Note: `test_createEmitsOrganizerMembership` checks only the indexed `member` topic and the data (`joined`). The squad address isn't known before the call, so topic 2 is not checked.\n\n- [ ] **Step 5: Write the failing Open-phase tests `contracts/test/SquadSetup.t.sol`**\n"},{"oldText":"import {Base} from \"./Base.t.sol\";\nimport {Squad} from \"../src/Squad.sol\";\n\ncontract SquadSetupTest is Base {\n","newText":"import {Base} from \"./Base.t.sol\";\nimport {Squad} from \"../src/Squad.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\n\ncontract SquadSetupTest is Base {\n"},{"oldText":"\n    function test_joinRevertsWhenFull() public {\n","newText":"\n    function test_joinRequiresInviteCode() public {\n        vm.prank(users[0]);\n        Squad open = Squad(factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE));\n        vm.prank(users[4]);\n        vm.expectRevert(Squad.BadInvite.selector);\n        open.join(keccak256(\"wrong\"));\n    }\n\n    function test_joinRevertsWhenFull() public {\n"},{"oldText":"        vm.expectRevert(Squad.Full.selector);\n        s.join();\n    }\n","newText":"        vm.expectRevert(Squad.Full.selector);\n        s.join(CODE);\n    }\n"},{"oldText":"        vm.expectRevert(Squad.AlreadyMember.selector);\n        s.join();\n    }\n","newText":"        vm.expectRevert(Squad.AlreadyMember.selector);\n        s.join(CODE);\n    }\n"},{"oldText":"- [ ] **Step 5: Run the tests to verify they fail**\n","newText":"- [ ] **Step 6: Run the tests to verify they fail**\n"},{"oldText":"Run: `cd contracts && forge test --match-contract \"SquadFactoryTest|SquadSetupTest\"`\nExpected: compile error, `Source \"src/SquadFactory.sol\" not found`.\n","newText":"Run: `cd contracts && forge test --match-contract \"TrustRegistryTest|SquadFactoryTest|SquadSetupTest\"`\nExpected: compile error, `Source \"src/TrustRegistry.sol\" not found`.\n"},{"oldText":"- [ ] **Step 6: Write `contracts/src/SquadFactory.sol`**\n","newText":"- [ ] **Step 7: Write `contracts/src/TrustRegistry.sol`**\n"},{"oldText":"\nimport {IERC20} from \"@openzeppelin/contracts/token/ERC20/IERC20.sol\";\nimport {ITrust} from \"./ITrust.sol\";\n","newText":"\nimport {ITrust} from \"./ITrust.sol\";\n"},{"oldText":"import {Squad} from \"./Squad.sol\";\n","newText":""},{"oldText":"contract SquadFactory is ITrust {\n    enum Period { Demo, Weekly, Monthly }\n\n","newText":"/// Portable trust history. Survives factory redeploys: the owner allowlists factories,\n/// factories register the squads they create, and only registered squads write.\ncontract TrustRegistry is ITrust {\n"},{"oldText":"\n    IERC20 public immutable token;\n    mapping(address => bool) public isSquad;\n","newText":"\n    address public immutable owner;\n    mapping(address => bool) public isWriter;\n    mapping(address => bool) public isSquad;\n"},{"oldText":"    address[] public squads;\n","newText":""},{"oldText":"    event SquadCreated(\n        address indexed squad, address indexed organizer, uint256 contribution, uint8 maxMembers, Period period\n    );\n","newText":"    event WriterSet(address indexed factory, bool allowed);\n    event SquadRegistered(address indexed factory, address indexed squad);\n"},{"oldText":"    error BadParams();\n","newText":"    error NotOwner();\n    error NotWriter();\n"},{"oldText":"    error NotSquad();\n\n","newText":"    error NotSquad();\n\n    constructor(address _owner) {\n        owner = _owner;\n    }\n\n    function setWriter(address factory, bool allowed) external {\n        if (msg.sender != owner) revert NotOwner();\n        isWriter[factory] = allowed;\n        emit WriterSet(factory, allowed);\n    }\n\n    function registerSquad(address squad) external {\n        if (!isWriter[msg.sender]) revert NotWriter();\n        isSquad[squad] = true;\n        emit SquadRegistered(msg.sender, squad);\n    }\n\n"},{"oldText":"    }\n\n    constructor(IERC20 _token) {\n        token = _token;\n    }\n\n    function timing(Period p) public pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow) {\n        if (p == Period.Demo) return (300, 60, 300);\n        if (p == Period.Weekly) return (604800, 43200, 172800);\n        return (2592000, 172800, 259200);\n    }\n\n    function createSquad(uint256 contribution, uint8 maxMembers, Period period) external returns (address) {\n        if (contribution < 100e18 || maxMembers < 3 || maxMembers > 20) revert BadParams();\n        (uint32 rl, uint32 g, uint32 dw) = timing(period);\n        Squad s = new Squad(token, ITrust(address(this)), msg.sender, contribution, maxMembers, rl, g, dw);\n        isSquad[address(s)] = true;\n        squads.push(address(s));\n        emit SquadCreated(address(s), msg.sender, contribution, maxMembers, period);\n        return address(s);\n    }\n\n    function squadCount() external view returns (uint256) {\n        return squads.length;\n","newText":""},{"oldText":"- [ ] **Step 7: Write `contracts/src/Squad.sol` (storage plus Open phase; later tasks add to this file)**\n","newText":"- [ ] **Step 8: Write `contracts/src/SquadFactory.sol`**\n\n```solidity\n// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nimport {IERC20} from \"@openzeppelin/contracts/token/ERC20/IERC20.sol\";\nimport {ITrust, IMembership} from \"./ITrust.sol\";\nimport {TrustRegistry} from \"./TrustRegistry.sol\";\nimport {Squad} from \"./Squad.sol\";\n\ncontract SquadFactory is IMembership {\n    enum Period { Demo, Weekly, Monthly }\n\n    IERC20 public immutable token;\n    TrustRegistry public immutable registry;\n    mapping(address => bool) public isSquad;\n    address[] public squads;\n\n    event SquadCreated(\n        address indexed squad, address indexed organizer, uint256 contribution, uint8 maxMembers, Period period\n    );\n    /// Lets the app list a user's squads with one indexed log query.\n    event Membership(address indexed member, address indexed squad, bool joined);\n\n    error BadParams();\n    error NotSquad();\n\n    constructor(IERC20 _token, TrustRegistry _registry) {\n        token = _token;\n        registry = _registry;\n    }\n\n    function timing(Period p) public pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow) {\n        if (p == Period.Demo) return (300, 60, 300);\n        if (p == Period.Weekly) return (604800, 43200, 172800);\n        return (2592000, 172800, 259200);\n    }\n\n    function createSquad(uint256 contribution, uint8 maxMembers, Period period, bytes32 inviteHash)\n        external\n        returns (address)\n    {\n        if (contribution < 100e18 || maxMembers < 3 || maxMembers > 20 || inviteHash == bytes32(0)) {\n            revert BadParams();\n        }\n        (uint32 rl, uint32 g, uint32 dw) = timing(period);\n        Squad s = new Squad(\n            token, ITrust(address(registry)), IMembership(address(this)), msg.sender, contribution, maxMembers, rl, g, dw, inviteHash\n        );\n        isSquad[address(s)] = true;\n        squads.push(address(s));\n        registry.registerSquad(address(s));\n        emit SquadCreated(address(s), msg.sender, contribution, maxMembers, period);\n        emit Membership(msg.sender, address(s), true);\n        return address(s);\n    }\n\n    function squadCount() external view returns (uint256) {\n        return squads.length;\n    }\n\n    function noteMembership(address member, bool joined) external {\n        if (!isSquad[msg.sender]) revert NotSquad();\n        emit Membership(member, msg.sender, joined);\n    }\n}\n```\n\n- [ ] **Step 9: Write `contracts/src/Squad.sol` (storage plus Open phase; later tasks add to this file)**\n"},{"oldText":"import {SafeERC20} from \"@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol\";\nimport {ITrust} from \"./ITrust.sol\";\n\n","newText":"import {SafeERC20} from \"@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol\";\nimport {ITrust, IMembership} from \"./ITrust.sol\";\n\n"},{"oldText":"    uint256 public constant COMPLETED_MIN_MEMBERS = 5;\n    uint256 public constant COMPLETED_MIN_CONTRIBUTION = 1000e18;\n","newText":"    uint256 public constant TRUST_MIN_MEMBERS = 5;\n    uint256 public constant TRUST_MIN_CONTRIBUTION = 1000e18;\n"},{"oldText":"    ITrust public immutable factory;\n","newText":"    ITrust public immutable trust;\n    IMembership public immutable factory;\n"},{"oldText":"    uint32 public immutable depositWindow;\n\n","newText":"    uint32 public immutable depositWindow;\n    bytes32 public immutable inviteHash;\n\n"},{"oldText":"\n    uint64 public depositDeadline;\n","newText":"\n    bool public countsForTrust; // set at activation: n >= 5 and c >= 1000e18\n    uint64 public depositDeadline;\n"},{"oldText":"    error OrganizerCannotLeave();\n\n","newText":"    error OrganizerCannotLeave();\n    error BadInvite();\n\n"},{"oldText":"        ITrust _factory,\n","newText":"        ITrust _trust,\n        IMembership _factory,\n"},{"oldText":"        uint32 _depositWindow\n","newText":"        uint32 _depositWindow,\n        bytes32 _inviteHash\n"},{"oldText":"        token = _token;\n        factory = _factory;\n","newText":"        token = _token;\n        trust = _trust;\n        factory = _factory;\n"},{"oldText":"        depositWindow = _depositWindow;\n        members.push(_organizer);\n","newText":"        depositWindow = _depositWindow;\n        inviteHash = _inviteHash;\n        members.push(_organizer);\n"},{"oldText":"        emit Joined(_organizer);\n","newText":"        emit Joined(_organizer); // the factory emits the organizer's Membership event\n"},{"oldText":"    function join() external inState(State.Open) {\n","newText":"    /// `code` travels in the invite link; only its hash is stored.\n    function join(bytes32 code) external inState(State.Open) {\n        if (keccak256(abi.encode(code)) != inviteHash) revert BadInvite();\n"},{"oldText":"        isMember[msg.sender] = true;\n        emit Joined(msg.sender);\n","newText":"        isMember[msg.sender] = true;\n        factory.noteMembership(msg.sender, true);\n        emit Joined(msg.sender);\n"},{"oldText":"        isMember[msg.sender] = false;\n        emit Left(msg.sender);\n","newText":"        isMember[msg.sender] = false;\n        factory.noteMembership(msg.sender, false);\n        emit Left(msg.sender);\n"},{"oldText":"- [ ] **Step 8: Run the tests to verify they pass**\n","newText":"- [ ] **Step 10: Run the tests to verify they pass**\n"},{"oldText":"Run: `cd contracts && forge test --match-contract \"SquadFactoryTest|SquadSetupTest\"`\nExpected: 12 tests pass.\n","newText":"Run: `cd contracts && forge test --match-contract \"TrustRegistryTest|SquadFactoryTest|SquadSetupTest\"`\nExpected: 20 tests pass (6 registry + 7 factory + 7 setup).\n"},{"oldText":"- [ ] **Step 9: Commit**\n","newText":"- [ ] **Step 11: Commit**\n"},{"oldText":"git commit -m \"feat(contracts): add SquadFactory with trust records and squad Open phase\"\n","newText":"git commit -m \"feat(contracts): trust registry, invite-only squads, factory membership events\"\n"},{"oldText":"        if (factory.tier(m) == RELIABLE && full > 3 * c) full = 3 * c;\n","newText":"        if (trust.tier(m) == RELIABLE && full > 3 * c) full = 3 * c;\n"},{"oldText":"                isMember[m] = false;\n                emit Dropped(m);\n","newText":"                isMember[m] = false;\n                factory.noteMembership(m, false);\n                emit Dropped(m);\n"},{"oldText":"            score[i] = factory.trustScore(members[i]);\n","newText":"            score[i] = trust.trustScore(members[i]);\n"},{"oldText":"        state = State.Active;\n        currentRound = 1;\n","newText":"        state = State.Active;\n        countsForTrust = members.length >= TRUST_MIN_MEMBERS && contribution >= TRUST_MIN_CONTRIBUTION;\n        currentRound = 1;\n"},{"oldText":"Expected: 15 tests pass.\n","newText":"Expected: 16 tests pass.\n"},{"oldText":"    function test_lateContributionRecordedLate() public {\n        Squad s = _active(3, C);\n        address m = _turn(s, 2);\n","newText":"    function test_lateContributionRecordedLate() public {\n        Squad s = _active(5, C); // 5 members at ₦1000 counts for trust\n        address m = _turn(s, 2);\n"},{"oldText":"        (, uint32 late,,) = factory.records(m);\n","newText":"        (, uint32 late,,) = registry.records(m);\n"},{"oldText":"        (,, uint32 missed,) = factory.records(t1);\n        assertEq(missed, 1);\n","newText":"        (,, uint32 missed,) = registry.records(t1);\n        assertEq(missed, 0); // 3-member squads never write trust\n"},{"oldText":"        (,,, uint32 doneSmall) = factory.records(users[1]);\n","newText":"        (,,, uint32 doneSmall) = registry.records(users[1]);\n"},{"oldText":"        (,,, uint32 doneBig) = factory.records(users[1]);\n","newText":"        (,,, uint32 doneBig) = registry.records(users[1]);\n"},{"oldText":"        assertEq(doneBig, 1);\n    }\n","newText":"        assertEq(doneBig, 1);\n    }\n\n    function test_payingMemberWithLowDepositNotStopped() public {\n        Squad s = _active(4, C);\n        address t1 = _turn(s, 1);\n        _payAllExcept(s, address(0)); // r1\n        _payAllExcept(s, t1);         // r2: t1 misses\n        _warpPastGrace(s);\n        s.settleRound(2);\n        _payAllExcept(s, address(0)); // r3: t1 pays but never refills\n        _payAllExcept(s, address(0)); // r4\n        assertFalse(s.stoppedPaying(t1));\n        assertEq(uint8(s.state()), uint8(Squad.State.Completed));\n        assertEq(token.balanceOf(address(s)), 0);\n    }\n\n    function test_finishNeverRevertsWhenJarShort() public {\n        Squad s = _active(3, C);\n        _payAllExcept(s, address(0)); // r1\n        _payAllExcept(s, address(0)); // r2\n        // Simulate unrepaid fronting: the jar holds 1c less than the deposits it owes back.\n        deal(address(token), address(s), token.balanceOf(address(s)) - C);\n        _payAllExcept(s, address(0)); // r3 settles and finishes\n        assertEq(uint8(s.state()), uint8(Squad.State.Completed));\n        assertEq(token.balanceOf(address(s)), 0);\n    }\n"},{"oldText":"        factory.recordContribution(msg.sender, late);\n","newText":"        if (countsForTrust) trust.recordContribution(msg.sender, late);\n"},{"oldText":"            if (\n                !stoppedPaying[m] && refillBy[m] != 0 && refillBy[m] <= r && locked[m] < required[m]\n            ) _stop(m, r, n);\n","newText":""},{"oldText":"            if (paid[r][m]) continue;\n            missed[mc++] = m;\n","newText":"            if (paid[r][m]) continue;\n            // Stopped paying = still owes a refill from an earlier miss AND missed again.\n            if (!stoppedPaying[m] && refillBy[m] != 0 && refillBy[m] <= r && locked[m] < required[m]) {\n                _stop(m, r, n);\n            }\n            missed[mc++] = m;\n"},{"oldText":"                factory.recordMiss(m);\n","newText":"                if (countsForTrust) trust.recordMiss(m);\n"},{"oldText":"\n    function _finish() internal {\n","newText":"\n    /// Ends the squad. Pays only from what the jar actually holds, so it can never revert:\n    /// if unrepaid fronting left the jar short, refunds are scaled down pro rata.\n    function _finish() internal {\n"},{"oldText":"        uint256 forfeit;\n","newText":"        uint256 sumKept; // deposits owed back to members still paying\n"},{"oldText":"        uint256 nonStopped;\n","newText":"        address lastPayer;\n"},{"oldText":"                forfeit += locked[m];\n                totalLocked -= locked[m];\n","newText":"                totalLocked -= locked[m]; // forfeited; stays in the jar for the honest pool\n"},{"oldText":"                nonStopped++;\n","newText":"                sumKept += locked[m];\n                lastPayer = m;\n"},{"oldText":"        uint256 cut;\n        if (frontedTotal > forfeit) {\n            uint256 deficit = frontedTotal - forfeit;\n            forfeit = 0;\n            if (nonStopped > 0) cut = (deficit + nonStopped - 1) / nonStopped;\n        } else {\n            forfeit -= frontedTotal;\n        }\n","newText":"        state = State.Completed;\n"},{"oldText":"        uint256 share = honest > 0 ? forfeit / honest : 0;\n        bool eligible = n >= COMPLETED_MIN_MEMBERS && contribution >= COMPLETED_MIN_CONTRIBUTION;\n        state = State.Completed;\n","newText":"        uint256 avail = token.balanceOf(address(this));\n        uint256 pool = avail > sumKept ? avail - sumKept : 0; // forfeits net of unrepaid fronting\n        uint256 share = honest > 0 ? pool / honest : 0;\n"},{"oldText":"            amt = amt > cut ? amt - cut : 0;\n","newText":"            if (avail < sumKept) amt = (amt * avail) / sumKept;\n"},{"oldText":"                if (eligible) factory.recordCompleted(m);\n","newText":"                if (countsForTrust) trust.recordCompleted(m);\n"},{"oldText":"        if (dust > 0) token.safeTransfer(members[n - 1], dust);\n","newText":"        if (dust > 0) token.safeTransfer(lastPayer != address(0) ? lastPayer : members[n - 1], dust);\n"},{"oldText":"Expected: 15 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).\n","newText":"Expected: 18 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).\n"},{"oldText":"Expected: 34 tests pass.\n","newText":"Expected: 52 tests pass (5 token + 6 registry + 7 factory + 16 setup + 18 rounds).\n"},{"oldText":"pragma solidity ^0.8.24;\n\nimport {Test} from \"forge-std/Test.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\nimport {Squad} from \"../src/Squad.sol\";\n\ncontract Handler is Test {\n","newText":"pragma solidity ^0.8.24;\n\nimport {Test} from \"forge-std/Test.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {TrustRegistry} from \"../src/TrustRegistry.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\nimport {Squad} from \"../src/Squad.sol\";\n\ncontract Handler is Test {\n"},{"oldText":"        s.settleRound(s.currentRound());\n    }\n}\n\n","newText":"        s.settleRound(s.currentRound());\n    }\n\n    /// Lets time pass with nobody paying, so members miss, fail to refill, and get stopped.\n    function idle(uint256 secs) external {\n        vm.warp(block.timestamp + bound(secs, 1, 15 minutes));\n    }\n}\n\n"},{"oldText":"contract InvariantTest is Test {\n    AjoNGN token;\n    SquadFactory factory;\n    Squad s;\n","newText":"contract InvariantTest is Test {\n    AjoNGN token;\n    TrustRegistry registry;\n    SquadFactory factory;\n    Squad s;\n"},{"oldText":"    Handler handler;\n\n    function setUp() public {\n        token = new AjoNGN();\n","newText":"    Handler handler;\n\n    /// 6 members at ₦1000 (counts for trust); m0 and m1 are Reliable, so capped deposits,\n    /// coverPerRound, and fronting paths all get exercised.\n    function setUp() public {\n        token = new AjoNGN();\n"},{"oldText":"        factory = new SquadFactory(token);\n        address[] memory us = new address[](5);\n        for (uint256 i; i < 5; i++) {\n","newText":"        registry = new TrustRegistry(address(this));\n        factory = new SquadFactory(token, registry);\n        registry.setWriter(address(factory), true);\n        bytes32 code = keccak256(\"invite-code\");\n        bytes32 invite = keccak256(abi.encode(code));\n        address[] memory us = new address[](6);\n        for (uint256 i; i < 6; i++) {\n"},{"oldText":"            token.faucet(200_000e18);\n        }\n        vm.prank(us[0]);\n        s = Squad(factory.createSquad(1000e18, 5, SquadFactory.Period.Demo));\n        for (uint256 i; i < 5; i++) {\n","newText":"            token.faucet(200_000e18);\n        }\n        address dummy = factory.createSquad(1000e18, 3, SquadFactory.Period.Demo, invite);\n        vm.startPrank(dummy);\n        for (uint256 i; i < 20; i++) {\n            registry.recordContribution(us[0], false);\n            registry.recordContribution(us[1], false);\n        }\n        vm.stopPrank();\n        vm.prank(us[0]);\n        s = Squad(factory.createSquad(1000e18, 6, SquadFactory.Period.Demo, invite));\n        for (uint256 i; i < 6; i++) {\n"},{"oldText":"            if (i > 0) s.join();\n","newText":"            if (i > 0) s.join(code);\n"},{"oldText":"        s.start();\n        for (uint256 i; i < 5; i++) {\n            address m = s.memberAt(i);\n","newText":"        s.start();\n        for (uint256 i; i < 6; i++) {\n            address m = s.memberAt(i);\n"},{"oldText":"Expected: 2 invariants pass across 256 runs × depth 60. If one fails, forge prints the call sequence. Fix `_settle` or `_cover` in `Squad.sol`, not the test.\n","newText":"Expected: 2 invariants pass across 256 runs × depth 60, with `fail_on_revert = true` (any unexpected revert in `settleRound` or `_finish` fails the run). If one fails, forge prints the call sequence. Fix `_settle` or `_cover` in `Squad.sol`, not the test.\n"},{"oldText":"- Create: `contracts/script/Deploy.s.sol`, `contracts/.env.example`, `contracts/deployments/monad-testnet.json`, `contracts/abi/AjoNGN.json`, `contracts/abi/SquadFactory.json`, `contracts/abi/Squad.json`\n","newText":"- Create: `contracts/script/Deploy.s.sol`, `contracts/.env.example`, `contracts/deployments/monad-testnet.json`, `contracts/abi/AjoNGN.json`, `contracts/abi/TrustRegistry.json`, `contracts/abi/SquadFactory.json`, `contracts/abi/Squad.json`\n"},{"oldText":"  - `contracts/deployments/monad-testnet.json` shaped as `{\"chainId\":10143,\"token\":\"0x…\",\"factory\":\"0x…\",\"deployBlock\":N}`\n","newText":"  - `contracts/deployments/monad-testnet.json` shaped as `{\"chainId\":10143,\"token\":\"0x…\",\"registry\":\"0x…\",\"factory\":\"0x…\",\"deployBlock\":N}`\n"},{"oldText":"import {Script, console2} from \"forge-std/Script.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\n\n","newText":"import {Script, console2} from \"forge-std/Script.sol\";\nimport {AjoNGN} from \"../src/AjoNGN.sol\";\nimport {TrustRegistry} from \"../src/TrustRegistry.sol\";\nimport {SquadFactory} from \"../src/SquadFactory.sol\";\n\n"},{"oldText":"        vm.startBroadcast(vm.envUint(\"DEPLOYER_KEY\"));\n","newText":"        uint256 key = vm.envUint(\"DEPLOYER_KEY\");\n        vm.startBroadcast(key);\n"},{"oldText":"        SquadFactory factory = new SquadFactory(token);\n","newText":"        TrustRegistry registry = new TrustRegistry(vm.addr(key));\n        SquadFactory factory = new SquadFactory(token, registry);\n        registry.setWriter(address(factory), true);\n"},{"oldText":"        console2.log(\"token\", address(token));\n        console2.log(\"factory\", address(factory));\n","newText":"        console2.log(\"token\", address(token));\n        console2.log(\"registry\", address(registry));\n        console2.log(\"factory\", address(factory));\n"},{"oldText":"Expected: the log prints `token 0x…` and `factory 0x…`.\n","newText":"Expected: the log prints `token 0x…`, `registry 0x…`, and `factory 0x…`.\n"},{"oldText":"\n- [ ] **Step 6: Record addresses and export ABIs**\n","newText":"\n```bash\ncast call <registry> \"isWriter(address)(bool)\" <factory> --rpc-url monad_testnet\ncast block latest --field mixHash --rpc-url monad_testnet\ncast block $(( $(cast block-number --rpc-url monad_testnet) - 1 )) --field mixHash --rpc-url monad_testnet\n```\n\nExpected: `true`, then two **different** hashes. `mixHash` is what `block.prevrandao` returns. If both hashes are identical (or zero), Monad testnet's prevrandao is constant and turn order for new users becomes predictable. In that case, record it in `TODOS.md` under \"turn-order randomness\" before moving on. It doesn't block the hackathon demo.\n\n- [ ] **Step 6: Record addresses and export ABIs**\n"},{"oldText":"forge inspect AjoNGN abi --json > abi/AjoNGN.json\nforge inspect SquadFactory abi --json > abi/SquadFactory.json\n","newText":"forge inspect AjoNGN abi --json > abi/AjoNGN.json\nforge inspect TrustRegistry abi --json > abi/TrustRegistry.json\nforge inspect SquadFactory abi --json > abi/SquadFactory.json\n"}]} -->

<!-- autoplan-accepted:ceo -->
- AjoNGN inherits ERC20Permit; test_permitSetsAllowance passes.
- TrustRegistry owns trust records; owner-only setWriter; writer-only registerSquad; squad-only record functions; history survives a new factory (test_historySurvivesNewFactory).
- Squads write trust only when activated with n >= 5 and c >= 1000e18 (countsForTrust); 3-member squads record nothing.
- createSquad takes bytes32 inviteHash (non-zero); join(bytes32 code) reverts BadInvite unless keccak256(abi.encode(code)) == inviteHash.
- Factory emits Membership(member, squad, joined) on create, join, leave and drop.
- A member is marked stopped paying only when a refill is overdue AND they missed the current round (test_payingMemberWithLowDepositNotStopped).
- _finish pays from the actual jar balance, pro rata when short, and never reverts; dust goes to the last member still paying (test_finishNeverRevertsWhenJarShort).
- Invariant suite uses fail_on_revert = true, a 6-member squad with two Reliable members, and an idle warp action.
- Deploy smoke test checks registry isWriter and that prevrandao (mixHash) differs between consecutive blocks; if constant, record in TODOS.md.
- Plan test counts: 5 token, 6 registry, 7 factory, 16 setup, 18 rounds, 52 total.
<!-- /autoplan-accepted:ceo -->

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|----------|
| 1 | CEO | Mode SELECTIVE EXPANSION | Mechanical | override | autoplan rule | other modes |
| 2 | CEO | Split TrustRegistry from factory | Mechanical | P1/P2 | reputation must survive redeploys; under 1 day | trust in factory |
| 3 | CEO | Gate trust writes on n>=5, c>=1000e18 | Taste | P1 | blocks cheap farming; Demo squads still count when real-sized | Demo writes nothing |
| 4 | CEO | Invite-hash join | Mechanical | P1 | stops strangers filling or griefing squads | open join |
| 5 | CEO | ERC20Permit on token | Mechanical | P2 | token is immutable; keeps a one-tx approval option for Plan 2 | plain ERC20 |
| 6 | CEO | Membership events from factory | Mechanical | P2 | app needs "my squads" without scanning all squads | event scan per squad |
| 7 | CEO | Stop only when refill overdue AND missed again | Mechanical | P5 | a member who keeps paying should not lose their deposit | stop on low deposit alone |
| 8 | CEO | _finish pays pro rata from balance | Mechanical | P1 | removes the permanent-lock revert | cut-based math |
| 9 | CEO | Invariant: Reliable members, idle action, fail_on_revert | Mechanical | P1 | fuzz must reach the risky paths | single-tier fuzz |
| 10 | CEO | Commit-reveal ordering deferred; prevrandao checked on day 1 | Taste | P3 | testnet hackathon, low impact | build commit-reveal now |
| 11 | CEO | Social vouching deferred | Mechanical | P3 | L effort, outside blast radius | add to plan |
| 12 | CEO | Full-collateral premise queued to gate | Premise | — | needs human judgment on pitch framing | auto-accept |

### Phase 2.5: DX review (mode: DX POLISH, auto-decided)

**Product type:** Library/SDK. The contracts are consumed through ABIs, a deployments JSON, and errors.

**Persona (auto, P6):**
```
TARGET DEVELOPER PERSONA
Who:       The solo builder's own Plan-2 implementer (an AI agent or the builder) wiring a Next.js app to these contracts
Context:   Day 4 of 12, needs addresses, ABIs, and error meanings within minutes
Tolerance: ~10 minutes before hacking around missing pieces
Expects:   One deploy command, a JSON with addresses, ABIs on disk, readable errors
```

**Empathy narrative.** I open the plan after Task 5 passes. To get an address I need a testnet key, faucet MON, and a deploy. Then I hand-copy addresses out of a gitignored broadcast file. The token says "approve with a signature", but no squad function takes one. When `createSquad` reverts with `BadParams()` I can't tell which of four checks failed, so my UI can only say "something went wrong". The trust registry's owner is a hot key with no rotation.

**Competitive benchmark (reference, no search):**
- Stripe: 30s.
- Typical Foundry template with anvil plus deploy script: about 2 min.
- This plan before review: about 20 min (key, faucet, deploy, copy). After review: about 2 min locally (anvil plus one command).

Target: Competitive (2 to 5 min).

**Magical moment:** `forge script ... --rpc-url localhost` prints addresses and writes `deployments/31337.json` that the app imports directly.

**Developer journey:**

| Stage | Developer does | Friction | Status |
|---|---|---|---|
| Discover | reads `contracts/README.md` | no README | fixed |
| Install | `forge init`/`install` | forge-std collision | fixed (`--no-deps`) |
| Hello world | local deploy | testnet-only | fixed (anvil path) |
| Real usage | joins and pays from the app | permit unused, missing view fields | fixed (`joinWithPermit`, `getState` fields, `settleableAfter`) |
| Debug | maps reverts to copy | overloaded errors | fixed (typed errors and catalogue) |
| Upgrade | redeploys factory | registry owner frozen | fixed (`Ownable2Step`) |

**First-time confusion report:**
- T+0:00: Scaffold fails on forge-std (fixed).
- T+3:00: No local chain (fixed).
- T+8:00: `BadParams` gives no reason (fixed).
- T+12:00: Permit is unclear (fixed).

**DX DUAL VOICES: CONSENSUS TABLE** `[subagent-only]`
```
  Dimension                       Claude-sub  Codex  Consensus
  1. Getting started < 5 min?     NO          N/A    N/A
  2. API naming guessable?        PARTIAL     N/A    N/A
  3. Errors actionable?           NO          N/A    N/A
  4. Docs findable?               NO          N/A    N/A
  5. Upgrade path safe?           NO          N/A    N/A
  6. Dev env friction-free?       NO          N/A    N/A
```

**Passes (before → after):**
- Pass 1, Getting Started: 3 → 8. Local anvil plus auto JSON.
- Pass 2, API: 5 → 8. `joinWithPermit`, `settleableAfter`, `getState` fields, `_requiredDepositFor` internal, `pot`→`payout`. Remaining: `AjoNGN` vs "Squadjar Naira" naming (taste, kept).
- Pass 3, Errors: 3 → 8. Typed errors with params, catalogue.
- Pass 4, Docs: 2 → 8. README.
- Pass 5, Upgrade: 4 → 7. `Ownable2Step` plus factory re-allowlisting.
- Pass 6, Environment: 5 → 8. `--no-deps`, `evm_version` pinned, `fs_permissions`, export script.
- Pass 7, Community: 5 → 6. Public repo plus Sourcify verification. A hackathon doesn't need more.
- Pass 8, Measurement: 3 → 5. TTHW is measured manually on day 4. Telemetry isn't warranted.

**DX Scorecard.** Overall 4 → 7.5/10. TTHW 20 min → 2 min (Competitive). Magical moment: designed (local deploy writes JSON).

**DX Implementation Checklist:**
- [x] Local deploy in one command
- [x] Addresses written automatically
- [x] Typed errors and catalogue
- [x] ABI export script
- [x] Ownership rotation
- [ ] Seed script for a demo squad (deferred to Plan 2)
- [ ] Organizer-signed invites (deferred to TODOS)

**NOT in scope:**
- Seed script (Plan 2 owns demo data).
- Signed membership invites (TODOS).
- Keystore `--account` deploys (taste; a testnet-only key is fine).
- Renaming `AjoNGN`.

<!-- autoplan-baseline-edits:dx {"sourceSha256":"206f1a24e61a3089ef0e4ea288f067d1b50be27e6c828f7334b3881d04b11c02","replacements":[{"oldText":"| `contracts/script/Deploy.s.sol` | Deploys the token and factory |\n| `contracts/deployments/monad-testnet.json` | Deployed addresses (written by hand after deploy) |\n","newText":"| `contracts/script/Deploy.s.sol` | Deploys token, registry, factory; writes `deployments/<chainId>.json` |\n| `contracts/script/export-abi.sh` | Regenerates `abi/*.json` |\n| `contracts/deployments/10143.json` | Monad testnet addresses (local 31337 is gitignored) |\n"},{"oldText":"| `contracts/abi/*.json` | ABIs exported for the app |\n\n","newText":"| `contracts/abi/*.json` | ABIs exported for the app |\n| `contracts/README.md` | Commands, lifecycle, invite recipe, error catalogue |\n\n"},{"oldText":"forge init contracts --no-git\n","newText":"forge init contracts --no-git --no-deps\n"},{"oldText":"forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std\n```\n\n- [ ] **Step 2: Write `contracts/foundry.toml`**\n","newText":"forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std\ngit -C .. submodule status\n```\n\nExpected: `git submodule status` lists `contracts/lib/forge-std` and `contracts/lib/openzeppelin-contracts`.\n\n- [ ] **Step 2: Write `contracts/foundry.toml`**\n"},{"oldText":"solc_version = \"0.8.24\"\noptimizer = true\noptimizer_runs = 200\n","newText":"solc_version = \"0.8.24\"\nevm_version = \"cancun\"\noptimizer = true\nfs_permissions = [{ access = \"read-write\", path = \"./deployments\" }]\noptimizer_runs = 200\n"},{"oldText":"        vm.expectRevert(TrustRegistry.NotOwner.selector);\n","newText":"        vm.expectRevert(abi.encodeWithSignature(\"OwnableUnauthorizedAccount(address)\", users[1]));\n"},{"oldText":"        registry.setWriter(users[1], true);\n    }\n","newText":"        registry.setWriter(users[1], true);\n    }\n\n    function test_ownershipTransfersInTwoSteps() public {\n        registry.transferOwnership(users[1]);\n        assertEq(registry.owner(), address(this));\n        vm.prank(users[1]);\n        registry.acceptOwnership();\n        assertEq(registry.owner(), users[1]);\n    }\n"},{"oldText":"    function test_createSquadRejectsSmallContribution() public {\n        vm.expectRevert(SquadFactory.BadParams.selector);\n        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo, INVITE);\n","newText":"    function test_createSquadRejectsSmallContribution() public {\n        vm.expectRevert(abi.encodeWithSelector(SquadFactory.ContributionTooLow.selector, 100e18));\n        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo, INVITE);\n"},{"oldText":"    function test_createSquadRejectsSizeOutOfRange() public {\n        vm.expectRevert(SquadFactory.BadParams.selector);\n        factory.createSquad(C, 2, SquadFactory.Period.Demo, INVITE);\n        vm.expectRevert(SquadFactory.BadParams.selector);\n        factory.createSquad(C, 21, SquadFactory.Period.Demo, INVITE);\n","newText":"    function test_createSquadRejectsSizeOutOfRange() public {\n        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));\n        factory.createSquad(C, 2, SquadFactory.Period.Demo, INVITE);\n        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));\n        factory.createSquad(C, 21, SquadFactory.Period.Demo, INVITE);\n"},{"oldText":"    function test_createSquadRejectsEmptyInvite() public {\n        vm.expectRevert(SquadFactory.BadParams.selector);\n        factory.createSquad(C, 5, SquadFactory.Period.Demo, bytes32(0));\n","newText":"    function test_createSquadRejectsEmptyInvite() public {\n        vm.expectRevert(SquadFactory.EmptyInvite.selector);\n        factory.createSquad(C, 5, SquadFactory.Period.Demo, bytes32(0));\n"},{"oldText":"\n    function test_cancelByOrganizerOnly() public {\n","newText":"\n    function test_joinWithPermitApprovesAndJoins() public {\n        vm.prank(users[0]);\n        Squad open = Squad(factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE));\n        (address joiner, uint256 key) = makeAddrAndKey(\"permitJoiner\");\n        uint256 deadline = block.timestamp + 1 hours;\n        bytes32 structHash = keccak256(\n            abi.encode(\n                keccak256(\"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)\"),\n                joiner, address(open), type(uint256).max, token.nonces(joiner), deadline\n            )\n        );\n        bytes32 digest = keccak256(abi.encodePacked(\"\\x19\\x01\", token.DOMAIN_SEPARATOR(), structHash));\n        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(key, digest);\n        vm.prank(joiner);\n        open.joinWithPermit(CODE, deadline, v, r, sg);\n        assertTrue(open.isMember(joiner));\n        assertEq(token.allowance(joiner, address(open)), type(uint256).max);\n    }\n\n    function test_cancelByOrganizerOnly() public {\n"},{"oldText":"\nimport {ITrust} from \"./ITrust.sol\";\n","newText":"\nimport {Ownable, Ownable2Step} from \"@openzeppelin/contracts/access/Ownable2Step.sol\";\nimport {ITrust} from \"./ITrust.sol\";\n"},{"oldText":"contract TrustRegistry is ITrust {\n","newText":"contract TrustRegistry is ITrust, Ownable2Step {\n    uint8 public constant NEW = 0;\n    uint8 public constant BUILDING = 1;\n    uint8 public constant RELIABLE = 2;\n\n"},{"oldText":"    address public immutable owner;\n","newText":""},{"oldText":"    error NotOwner();\n","newText":""},{"oldText":"    constructor(address _owner) {\n        owner = _owner;\n    }\n","newText":"    /// Ownable2Step: the owner key can be rotated (transferOwnership + acceptOwnership).\n    constructor(address _owner) Ownable(_owner) {}\n"},{"oldText":"    function setWriter(address factory, bool allowed) external {\n        if (msg.sender != owner) revert NotOwner();\n","newText":"    function setWriter(address factory, bool allowed) external onlyOwner {\n"},{"oldText":"        if (s >= 20) return 2;\n        if (s >= 5) return 1;\n        return 0;\n","newText":"        if (s >= 20) return RELIABLE;\n        if (s >= 5) return BUILDING;\n        return NEW;\n"},{"oldText":"    error BadParams();\n","newText":"    error ContributionTooLow(uint256 min);\n    error SizeOutOfRange(uint8 min, uint8 max);\n    error EmptyInvite();\n"},{"oldText":"        if (contribution < 100e18 || maxMembers < 3 || maxMembers > 20 || inviteHash == bytes32(0)) {\n            revert BadParams();\n        }\n","newText":"        if (contribution < 100e18) revert ContributionTooLow(100e18);\n        if (maxMembers < 3 || maxMembers > 20) revert SizeOutOfRange(3, 20);\n        if (inviteHash == bytes32(0)) revert EmptyInvite();\n"},{"oldText":"import {SafeERC20} from \"@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol\";\nimport {ITrust, IMembership} from \"./ITrust.sol\";\n","newText":"import {SafeERC20} from \"@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol\";\nimport {IERC20Permit} from \"@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol\";\nimport {ITrust, IMembership} from \"./ITrust.sol\";\n"},{"oldText":"    error WrongState();\n","newText":"    error WrongState(State current);\n"},{"oldText":"        if (state != s) revert WrongState();\n","newText":"        if (state != s) revert WrongState(state);\n"},{"oldText":"    function join(bytes32 code) external inState(State.Open) {\n","newText":"    function join(bytes32 code) public inState(State.Open) {\n"},{"oldText":"        emit Joined(msg.sender);\n    }\n","newText":"        emit Joined(msg.sender);\n    }\n\n    /// Join and grant this squad an unlimited allowance in one transaction.\n    /// A failed permit (e.g. already used) is ignored; transfers later revert if no allowance exists.\n    function joinWithPermit(bytes32 code, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {\n        try IERC20Permit(address(token)).permit(msg.sender, address(this), type(uint256).max, deadline, v, r, s) {} catch {}\n        join(code);\n    }\n"},{"oldText":"        if (msg.sender != organizer) revert NotOrganizer();\n        if (state != State.Open && state != State.Depositing) revert WrongState();\n","newText":"        if (msg.sender != organizer || !isMember[organizer]) revert NotOrganizer(); // a dropped organizer has no powers\n        if (state != State.Open && state != State.Depositing) revert WrongState(state);\n"},{"oldText":"Expected: 20 tests pass (6 registry + 7 factory + 7 setup).\n","newText":"Expected: 22 tests pass (7 registry + 7 factory + 8 setup).\n"},{"oldText":"  - `requiredDepositFor(address,uint256 n,uint256 p) view returns (uint256)`\n","newText":""},{"oldText":"        assertEq(s.memberCount(), 3);\n        // members whose turn moved up owe more, so a new window may be open; lock and confirm Active\n","newText":"        assertEq(s.memberCount(), 3);\n        if (s.state() == Squad.State.Depositing) {\n            vm.prank(users[0]);\n            vm.expectRevert(Squad.NotOrganizer.selector); // dropped organizer cannot cancel\n            s.cancel();\n        }\n        // members whose turn moved up owe more, so a new window may be open; lock and confirm Active\n"},{"oldText":"    function requiredDepositFor(address m, uint256 n, uint256 p) public view returns (uint256) {\n","newText":"    function _requiredDepositFor(address m, uint256 n, uint256 p) internal view returns (uint256) {\n"},{"oldText":"    function lockDeposit() external inState(State.Depositing) onlyMember {\n        uint256 amt = required[msg.sender] - locked[msg.sender];\n        if (amt == 0) revert NothingOwed();\n        _pullDeposit(msg.sender, amt);\n        emit DepositLocked(msg.sender, amt);\n","newText":"    function lockDeposit() external inState(State.Depositing) onlyMember {\n        if (locked[msg.sender] >= required[msg.sender]) revert NothingOwed();\n        uint256 amt = required[msg.sender] - locked[msg.sender];\n        _pullDeposit(msg.sender, amt);\n        emit DepositLocked(msg.sender, amt);\n"},{"oldText":"            required[m] = requiredDepositFor(m, n, i + 1);\n","newText":"            required[m] = _requiredDepositFor(m, n, i + 1);\n"},{"oldText":"Expected: 16 tests pass.\n","newText":"Expected: 17 tests pass.\n"},{"oldText":"  - `struct SquadView { State state; uint256 contribution; uint8 maxMembers; uint32 roundLength; uint32 grace; uint64 depositDeadline; uint64 roundDeadline; uint8 currentRound; address organizer; address[] members; uint256[] locked; uint256[] required; bool[] paidThisRound; bool[] stopped; uint8[] misses; }`. Turn equals array index + 1 after start.\n","newText":"  - `struct SquadView { State state; uint256 contribution; uint8 maxMembers; uint32 roundLength; uint32 grace; uint64 depositDeadline; uint64 roundDeadline; uint8 currentRound; address organizer; address[] members; uint256[] locked; uint256[] required; bool[] paidThisRound; bool[] stopped; uint8[] misses; uint8[] refillBy; uint256[] owed; bool countsForTrust; uint8 activeCount; uint256 totalLocked; uint64 settleableAfter; }`. Turn equals array index + 1 after start.\n"},{"oldText":"        vm.expectRevert(Squad.TooEarly.selector);\n","newText":"        vm.expectRevert(abi.encodeWithSelector(Squad.TooEarly.selector, s.settleableAfter()));\n"},{"oldText":"        uint8[] misses;\n    }\n","newText":"        uint8[] misses;\n        uint8[] refillBy;\n        uint256[] owed;\n        bool countsForTrust;\n        uint8 activeCount;\n        uint256 totalLocked;\n        uint64 settleableAfter;\n    }\n"},{"oldText":"    error TooEarly();\n","newText":"    error TooEarly(uint64 settleableAfter);\n"},{"oldText":"        if (block.timestamp > uint256(roundDeadline) + grace) revert PastGrace();\n","newText":"        if (block.timestamp > settleableAfter()) revert PastGrace();\n"},{"oldText":"        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();\n        uint256 amt = required[msg.sender] - locked[msg.sender];\n        if (amt == 0) revert NothingOwed();\n        _pullDeposit(msg.sender, amt);\n        refillBy[msg.sender] = 0;\n","newText":"        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();\n        if (locked[msg.sender] >= required[msg.sender]) revert NothingOwed();\n        uint256 amt = required[msg.sender] - locked[msg.sender];\n        _pullDeposit(msg.sender, amt);\n        refillBy[msg.sender] = 0;\n"},{"oldText":"\n    /// Anyone may call. `round` makes repeated cron calls safe.\n","newText":"\n    /// Timestamp after which settleRound works even if not everyone has paid.\n    function settleableAfter() public view returns (uint64) {\n        return roundDeadline + grace;\n    }\n\n    /// Anyone may call. `round` makes repeated cron calls safe.\n"},{"oldText":"        if (state != State.Active) revert WrongState();\n        if (round > currentRound) revert TooEarly();\n        if (paidCount < activeCount && block.timestamp <= uint256(roundDeadline) + grace) revert TooEarly();\n","newText":"        if (state != State.Active) revert WrongState(state);\n        if (round > currentRound) revert TooEarly(settleableAfter());\n        if (paidCount < activeCount && block.timestamp <= settleableAfter()) revert TooEarly(settleableAfter());\n"},{"oldText":"        uint256 pot = roundContributions;\n","newText":"        uint256 payout = roundContributions;\n"},{"oldText":"                pot += _cover(m, c, turnOf[m] >= r);\n","newText":"                payout += _cover(m, c, turnOf[m] >= r);\n"},{"oldText":"                pot += _cover(m, c, true);\n","newText":"                payout += _cover(m, c, true);\n"},{"oldText":"                pot += _cover(m, cap, false);\n","newText":"                payout += _cover(m, cap, false);\n"},{"oldText":"        uint256 gross = pot;\n","newText":"        uint256 gross = payout;\n"},{"oldText":"        v.misses = new uint8[](n);\n        for (uint256 i; i < n; i++) {\n","newText":"        v.misses = new uint8[](n);\n        v.refillBy = new uint8[](n);\n        v.owed = new uint256[](n);\n        v.countsForTrust = countsForTrust;\n        v.activeCount = activeCount;\n        v.totalLocked = totalLocked;\n        v.settleableAfter = settleableAfter();\n        for (uint256 i; i < n; i++) {\n"},{"oldText":"            v.misses[i] = missCount[m];\n        }\n","newText":"            v.misses[i] = missCount[m];\n            v.refillBy[i] = refillBy[m];\n            v.owed[i] = owed[m];\n        }\n"},{"oldText":"Expected: 52 tests pass (5 token + 6 registry + 7 factory + 16 setup + 18 rounds).\n","newText":"Expected: 54 tests pass (5 token + 7 registry + 7 factory + 17 setup + 18 rounds).\n"},{"oldText":"### Task 6: Deploy to Monad testnet and export ABIs\n","newText":"### Task 6: Deploy (local and Monad testnet), ABIs, and contracts README\n"},{"oldText":"- Create: `contracts/script/Deploy.s.sol`, `contracts/.env.example`, `contracts/deployments/monad-testnet.json`, `contracts/abi/AjoNGN.json`, `contracts/abi/TrustRegistry.json`, `contracts/abi/SquadFactory.json`, `contracts/abi/Squad.json`\n","newText":"- Create: `contracts/script/Deploy.s.sol`, `contracts/script/export-abi.sh`, `contracts/.env.example`, `contracts/README.md`, `contracts/deployments/31337.json` (local, gitignored), `contracts/deployments/10143.json`, `contracts/abi/*.json`\n- Modify: `.gitignore` (add `contracts/deployments/31337.json`)\n"},{"oldText":"  - `contracts/deployments/monad-testnet.json` shaped as `{\"chainId\":10143,\"token\":\"0x…\",\"registry\":\"0x…\",\"factory\":\"0x…\",\"deployBlock\":N}`\n  - ABI JSON files consumed by the app plan\n","newText":"  - `contracts/deployments/<chainId>.json`, written by the script itself, shaped as `{\"chainId\":10143,\"token\":\"0x…\",\"registry\":\"0x…\",\"factory\":\"0x…\",\"deployBlock\":N}`\n  - `contracts/abi/{AjoNGN,TrustRegistry,SquadFactory,Squad}.json`\n  - The error catalogue in `contracts/README.md`, which Plan 2 maps to user-facing copy\n"},{"oldText":"contract Deploy is Script {\n    function run() external {\n","newText":"contract Deploy is Script {\n    // Anvil's well-known account #0. Only ever used for chain 31337.\n    uint256 constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;\n\n    function run() external {\n"},{"oldText":"        uint256 key = vm.envUint(\"DEPLOYER_KEY\");\n","newText":"        uint256 key = block.chainid == 31337 ? ANVIL_KEY : vm.envOr(\"DEPLOYER_KEY\", uint256(0));\n        require(key != 0, \"DEPLOYER_KEY missing: copy contracts/.env.example to contracts/.env and fill it\");\n        address deployer = vm.addr(key);\n\n"},{"oldText":"        TrustRegistry registry = new TrustRegistry(vm.addr(key));\n","newText":"        TrustRegistry registry = new TrustRegistry(deployer);\n"},{"oldText":"        vm.stopBroadcast();\n        console2.log(\"token\", address(token));\n","newText":"        vm.stopBroadcast();\n\n        string memory obj = \"deployment\";\n        vm.serializeUint(obj, \"chainId\", block.chainid);\n        vm.serializeAddress(obj, \"token\", address(token));\n        vm.serializeAddress(obj, \"registry\", address(registry));\n        vm.serializeAddress(obj, \"factory\", address(factory));\n        string memory json = vm.serializeUint(obj, \"deployBlock\", block.number);\n        string memory path = string.concat(\"deployments/\", vm.toString(block.chainid), \".json\");\n        vm.writeJson(json, path);\n\n        console2.log(\"token\", address(token));\n"},{"oldText":"        console2.log(\"factory\", address(factory));\n    }\n","newText":"        console2.log(\"factory\", address(factory));\n        console2.log(\"wrote\", path);\n    }\n"},{"oldText":"# Testnet-only key funded from the Monad testnet faucet. Never a mainnet key.\nDEPLOYER_KEY=0x\n","newText":"# Testnet-only key. Create one with: cast wallet new\n# Fund it with testnet MON from the Monad testnet faucet (linked from https://docs.monad.xyz).\n# Never put a mainnet key here.\nDEPLOYER_KEY=\n"},{"oldText":"- [ ] **Step 3: Fund the deployer (human step)**\n","newText":"- [ ] **Step 3: Deploy locally (no key, no faucet needed)**\n"},{"oldText":"Create a fresh testnet key with `cast wallet new`, put it in `contracts/.env` (gitignored), and get testnet MON from the Monad testnet faucet listed at https://docs.monad.xyz.\n","newText":"```bash\ncd contracts\nmkdir -p deployments\nanvil --silent &\nforge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast\ncat deployments/31337.json\n```\n"},{"oldText":"- [ ] **Step 4: Deploy**\n","newText":"Expected: the JSON contains `chainId` 31337 and three addresses. Add `contracts/deployments/31337.json` to `.gitignore`. Plan 2 uses this local path for development and E2E tests. It uses `cast rpc evm_increaseTime` instead of waiting 300s per round.\n\n- [ ] **Step 4: Fund the testnet deployer (human step)**\n\nRun `cast wallet new`, then put the private key in `contracts/.env` (gitignored). Fund it from the Monad testnet faucet.\n\n- [ ] **Step 5: Deploy and verify on Monad testnet**\n"},{"oldText":"forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast\n","newText":"forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast \\\n  --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org\n"},{"oldText":"Expected: the log prints `token 0x…`, `registry 0x…`, and `factory 0x…`.\n","newText":"Expected:\n- The log prints `token`, `registry`, `factory`, and `wrote deployments/10143.json`.\n- If verification fails, the deployment still stands. Rerun only verification with `forge verify-contract <address> <Contract> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`.\n"},{"oldText":"- [ ] **Step 5: Smoke test onchain**\n","newText":"- [ ] **Step 6: Smoke test onchain**\n"},{"oldText":"cast call <factory> \"timing(uint8)(uint32,uint32,uint32)\" 0 --rpc-url monad_testnet\n```\n\nExpected: `300 60 300`.\n\n```bash\ncast call <registry> \"isWriter(address)(bool)\" <factory> --rpc-url monad_testnet\n","newText":"F=$(jq -r .factory deployments/10143.json); R=$(jq -r .registry deployments/10143.json)\ncast call $F \"timing(uint8)(uint32,uint32,uint32)\" 0 --rpc-url monad_testnet\ncast call $R \"isWriter(address)(bool)\" $F --rpc-url monad_testnet\n"},{"oldText":"Expected: `true`, then two **different** hashes. `mixHash` is what `block.prevrandao` returns. If both hashes are identical (or zero), Monad testnet's prevrandao is constant and turn order for new users becomes predictable. In that case, record it in `TODOS.md` under \"turn-order randomness\" before moving on. It doesn't block the hackathon demo.\n","newText":"Expected:\n- `300 60 300`.\n- `true`.\n- Two **different** hashes. `mixHash` is what `block.prevrandao` returns. If both are identical or zero, add \"turn-order randomness: prevrandao constant on Monad testnet\" to `TODOS.md`. This does not block the demo.\n"},{"oldText":"- [ ] **Step 6: Record addresses and export ABIs**\n\nWrite `contracts/deployments/monad-testnet.json` using the printed addresses and the block number from `broadcast/Deploy.s.sol/10143/run-latest.json` (`receipts[0].blockNumber`, converted from hex). Then:\n","newText":"- [ ] **Step 7: Write `contracts/script/export-abi.sh` and run it**\n"},{"oldText":"```bash\nmkdir -p abi\n","newText":"```bash\n#!/usr/bin/env bash\n# Regenerates the ABIs the app imports. Run after any contract change.\nset -euo pipefail\ncd \"$(dirname \"$0\")/..\"\nmkdir -p abi\n"},{"oldText":"forge inspect AjoNGN abi --json > abi/AjoNGN.json\nforge inspect TrustRegistry abi --json > abi/TrustRegistry.json\nforge inspect SquadFactory abi --json > abi/SquadFactory.json\nforge inspect Squad abi --json > abi/Squad.json\n","newText":"for c in AjoNGN TrustRegistry SquadFactory Squad; do\n  forge inspect \"$c\" abi --json > \"abi/$c.json\"\ndone\necho \"ABIs written to contracts/abi/\"\n"},{"oldText":"```\n\n- [ ] **Step 7: Commit**\n\n```bash\n","newText":"```\n\n```bash\nchmod +x contracts/script/export-abi.sh && contracts/script/export-abi.sh\n```\n\nExpected: 4 files in `contracts/abi/`.\n\n- [ ] **Step 8: Write `contracts/README.md`**\n\n````markdown\n# Squadjar contracts\n\nRotating savings (ajo) where no member holds the jar. Foundry, Solidity 0.8.24.\n\n## Commands\n\n| Task | Command |\n|---|---|\n| Test | `forge test` |\n| Local deploy | `anvil --silent &` then `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` |\n| Testnet deploy | `source .env && forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast` |\n| Export ABIs | `script/export-abi.sh` |\n\nAddresses: `deployments/<chainId>.json` (10143 = Monad testnet, 31337 = local anvil).\n\n## Squad lifecycle\n\n```\nOpen --start (organizer, >=3)--> Depositing --all deposits locked--> Active --round n settled--> Completed\nOpen | Depositing --cancel (organizer, still a member) or <3 left after finalize--> Cancelled\n```\n\n| Function | Caller | State |\n|---|---|---|\n| `join(code)` / `joinWithPermit(code, deadline, v, r, s)` | anyone with the invite code | Open |\n| `leave()` | member, not organizer | Open |\n| `start()` | organizer | Open |\n| `lockDeposit()` | member | Depositing |\n| `finalizeDeposits()` | anyone, after `depositDeadline` | Depositing |\n| `contribute()` / `refillDeposit()` | member | Active |\n| `settleRound(round)` | anyone; after `settleableAfter()` or once all have paid | Active |\n| `getState()` | view | any |\n\nInvite hash (viem): `keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]))`, where `code` is a random 32 bytes carried in the invite link. The code is visible onchain after the first join, so invite-only stops casual joins, not determined ones.\n\nEnums in the ABI: `Period` 0 Demo, 1 Weekly, 2 Monthly. `State` 0 Open, 1 Depositing, 2 Active, 3 Completed, 4 Cancelled. `tier()` 0 New, 1 Building, 2 Reliable.\n\n## Error catalogue\n\n| Error | Cause | What the user should do |\n|---|---|---|\n| `ContributionTooLow(min)` | Contribution under ₦100 | Pick at least ₦100 |\n| `SizeOutOfRange(min, max)` | Squad size outside 3 to 20 | Pick 3 to 20 people |\n| `EmptyInvite()` | App sent no invite hash | App bug: generate a code |\n| `BadInvite()` | Wrong or expired invite code | Ask the organizer for a fresh link |\n| `Full()` | Squad already has its max members | Ask the organizer to start a new squad |\n| `AlreadyMember()` | Joining twice | Open the squad instead |\n| `OrganizerCannotLeave()` | Organizer tried to leave | Cancel the squad instead |\n| `NotOrganizer()` | Non-organizer (or dropped organizer) tried start/cancel | Only the organizer can do this |\n| `NotMember()` | Caller isn't in the squad | Join first |\n| `WrongState(current)` | Action not allowed in this phase | Refresh; show what the squad is waiting for |\n| `TooFewMembers()` | Start with under 3 members | Invite more people |\n| `NothingOwed()` | Deposit already fully locked | Nothing to do |\n| `DepositWindowOpen()` | Finalize before the window closed | Wait for the deadline |\n| `AlreadyPaid()` | Paying twice in one round | Nothing to do |\n| `PastGrace()` | Paying after deadline + grace | The miss was covered by the deposit; refill it |\n| `MemberStoppedPaying()` | Member marked stopped paying | No more payments accepted from this member |\n| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |\n| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |\n| `FaucetCapExceeded()` | Top-up over ₦200,000 in one call | Top up in smaller amounts |\n| `NotWriter()` / `NotSquad()` | Registry access control | Deployment bug |\n````\n\n- [ ] **Step 9: Commit**\n\n```bash\n"},{"oldText":"git add contracts/script contracts/.env.example contracts/deployments contracts/abi\ngit commit -m \"chore(contracts): deploy to Monad testnet and export ABIs\"\n","newText":"git add .gitignore contracts/script contracts/.env.example contracts/README.md contracts/deployments/10143.json contracts/abi\ngit commit -m \"chore(contracts): local and testnet deploy, ABI export, README with error catalogue\"\n"}]} -->

<!-- autoplan-accepted:dx -->
- Task 1 scaffolds with `forge init contracts --no-git --no-deps` and checks `git submodule status` lists forge-std and openzeppelin-contracts; foundry.toml pins evm_version cancun and grants fs_permissions read-write on ./deployments.
- TrustRegistry uses OZ Ownable2Step (transferOwnership + acceptOwnership) with NEW/BUILDING/RELIABLE constants; tests test_onlyOwnerSetsWriters (OwnableUnauthorizedAccount) and test_ownershipTransfersInTwoSteps.
- SquadFactory reverts ContributionTooLow(100e18), SizeOutOfRange(3, 20), EmptyInvite() instead of BadParams.
- Squad: WrongState(State current); TooEarly(uint64 settleableAfter) with public settleableAfter() = roundDeadline + grace; dropped organizer cannot cancel; joinWithPermit(code, deadline, v, r, s) grants max allowance and joins (test_joinWithPermitApprovesAndJoins); _requiredDepositFor internal; lockDeposit/refillDeposit revert NothingOwed when locked >= required; _settle local renamed payout.
- getState adds refillBy[], owed[], countsForTrust, activeCount, totalLocked, settleableAfter.
- Deploy.s.sol uses the anvil key on chain 31337, requires DEPLOYER_KEY otherwise, and writes deployments/<chainId>.json itself; Task 6 adds local anvil deploy, Sourcify verify, export-abi.sh, and contracts/README.md with lifecycle, invite-hash recipe, enum ordinals and full error catalogue.
- Test counts supersede CEO block: 5 token, 7 registry, 7 factory, 17 setup, 18 rounds, 54 total.
<!-- /autoplan-accepted:dx -->

| 13 | DX | `--no-deps` scaffold | Mechanical | P5 | avoids forge-std collision | install both |
| 14 | DX | `joinWithPermit` | Mechanical | P1 | makes the permit useful; one tx join | drop permit claim |
| 15 | DX | Typed errors plus catalogue | Mechanical | P1 | problem + cause + fix | overloaded errors |
| 16 | DX | Script writes deployments JSON; anvil path | Mechanical | P5 | removes manual copying | hand-written JSON |
| 17 | DX | `Ownable2Step` registry | Mechanical | P1 | key rotation | immutable owner |
| 18 | DX | Richer `getState` plus `settleableAfter` | Mechanical | P1 | app renders refill and deadlines | client-side math |
| 19 | DX | Keep `AjoNGN` name | Taste | P3 | rename churn for no user gain | rename to SquadjarNaira |
| 20 | DX | Signed invites deferred | Taste | P3 | calldata leak is low impact on testnet | build now |

### Phase 3: Eng review (FULL_REVIEW, auto-decided)

**Scope gate:** plan mode was not active; the target was named by /autoplan (this plan).

**Step 0:**
- The complexity check triggers: 11 files, 4 contracts. Scope reduction is not allowed under the P2 override.
- All classes are justified: token, registry (survives redeploys), factory, squad.
- Built-ins reused: OZ ERC20Permit, Ownable2Step, SafeERC20.

**Verification by building.** The reviewer compiled every plan block (forge 1.7.1, OZ 5.1.0):
- 59/59 tests pass, and both invariants pass with 0 reverts.
- Squad is 16.5KB and SquadFactory 19.3KB, both under EIP-170.

**Architecture:**
```
AjoNGN ◀─transfer/permit── Squad ──trust r/w (onlySquad: isWriter[factoryOf[squad]])──▶ TrustRegistry (Ownable2Step)
                             ▲  └──noteMembership──▶ SquadFactory ──registerSquad──▶ TrustRegistry
                             └──────── new Squad(...) ── SquadFactory
```

**ENG DUAL VOICES: CONSENSUS TABLE** `[subagent-only]`
```
  Dimension                     Claude-sub  Codex  Consensus
  1. Architecture sound?        YES         N/A    N/A
  2. Test coverage sufficient?  PARTIAL     N/A    N/A
  3. Performance risks?         OK          N/A    N/A
  4. Security threats covered?  NO (sybil)  N/A    N/A
  5. Error paths handled?       YES         N/A    N/A
  6. Deployment risk ok?        YES         N/A    N/A
```

**Findings:**
- [P1] (9/10) A sybil can farm Reliable cheaply and steal from a squad. Paying ahead is fixed (`RoundNotOpen`); Demo-period trust is **queued as a User Challenge**.
- [P2] (9/10) A revoked factory's squads could still write trust. Fixed (`factoryOf` and the `isSquad` view).
- [P2] (8/10) The dropped-organizer test was dead. Fixed (cap is fixed at start, finalize always activates, the dead branch is removed).
- [P2] (8/10) Stopping recorded no miss. Fixed (`_stop` records a miss).
- [P2] (8/10) Invite squatting. Fixed (organizer `remove()` while Open).
- [P2] (7/10) The invariants don't check fairness. Deferred to TODOS.
- [P3] Low items: prevrandao grinding, and `owed` not cleared at finish. TODOS / accepted.

**Test diagram:**
```
Squad.sol
 ├ join / joinWithPermit / leave / remove / cancel ......... ★★★ SquadSetup
 ├ start / ordering / deposit formula / cap at start ....... ★★★ SquadSetup
 ├ lockDeposit / finalizeDeposits (drop, cancel <3) ........ ★★★ SquadSetup
 ├ contribute (on time / late / past grace / not open) ..... ★★★ SquadRounds
 ├ settleRound (early / duplicate / late schedule) ......... ★★★ SquadRounds
 ├ _cover (deposit / front / headroom cap) ................. ★★★ SquadRounds + Invariant
 ├ _stop (before / after collecting, miss recorded) ........ ★★  SquadRounds
 └ _finish (pro rata, dust, completed gate) ................ ★★★ SquadRounds + Invariant
TrustRegistry: access control, revocation, ownership, math . ★★★
GAP: fairness properties under fuzz (TODOS P2)
```

**Failure modes:**
- The sybil steal is a **CRITICAL GAP until the gate decides**: it isn't rescued, the test passes it, and it is silent to victims except as a smaller payout.
- All other paths revert with named errors, or are covered by tests.

**Parallelization:** sequential implementation (one module, `contracts/`).

**NOT in scope:** fairness fuzz, commit-reveal, signed invites, clone factory (gas), multisig owner.

**What already exists:** OpenZeppelin primitives only.

**Completion:**
- Architecture: 1 issue. Code quality: 3. Tests: 2 gaps. Performance: 0.
- Critical gaps: 1 (gate).
- TODOS: 6 written.
- Outside voice: subagent only.
- Lake Score: 6/6 complete options chosen.
- Unresolved: 1.

<!-- autoplan-baseline-edits:eng {"sourceSha256":"26bc4ea1528cb44c857cb4482ebb96ca9e7fbea1f10518398871a292082007e4","replacements":[{"oldText":"    - `isWriter(address)`, `isSquad(address)`\n","newText":"    - `isWriter(address)`, `isSquad(address)` (true only while the registering factory is allowlisted), `factoryOf(address)`\n"},{"oldText":"    function _payAllExcept(Squad s, address skip) internal {\n        uint8 r = s.currentRound();\n","newText":"    function _payAllExcept(Squad s, address skip) internal {\n        uint256 opensAt = uint256(s.roundDeadline()) - s.roundLength();\n        if (block.timestamp < opensAt) vm.warp(opensAt); // rounds open on schedule\n        uint8 r = s.currentRound();\n"},{"oldText":"        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n        assertTrue(registry.isSquad(s));\n    }\n\n","newText":"        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n        assertTrue(registry.isSquad(s));\n    }\n\n    function test_revokedFactorySquadsCannotWrite() public {\n        vm.prank(users[0]);\n        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE);\n        registry.setWriter(address(factory), false);\n        vm.prank(s);\n        vm.expectRevert(TrustRegistry.NotSquad.selector);\n        registry.recordMiss(users[1]);\n    }\n\n"},{"oldText":"\n    function test_organizerCannotLeave() public {\n","newText":"\n    function test_organizerRemovesMemberWhileOpen() public {\n        Squad s = _squad(3, C);\n        vm.prank(users[1]);\n        vm.expectRevert(Squad.NotOrganizer.selector);\n        s.remove(users[2]);\n        vm.prank(users[0]);\n        s.remove(users[2]);\n        assertFalse(s.isMember(users[2]));\n        assertEq(s.memberCount(), 2);\n    }\n\n    function test_organizerCannotLeave() public {\n"},{"oldText":"    mapping(address => bool) public isWriter;\n    mapping(address => bool) public isSquad;\n    mapping(address => Record) public records;\n","newText":"    mapping(address => bool) public isWriter;\n    mapping(address => address) public factoryOf; // squad => factory that registered it\n    mapping(address => Record) public records;\n"},{"oldText":"        isSquad[squad] = true;\n","newText":"        factoryOf[squad] = msg.sender;\n"},{"oldText":"\n    modifier onlySquad() {\n        if (!isSquad[msg.sender]) revert NotSquad();\n        _;\n","newText":"\n    /// A squad may write only while its factory is still allowlisted.\n    function isSquad(address squad) public view returns (bool) {\n        return isWriter[factoryOf[squad]];\n    }\n\n    modifier onlySquad() {\n        if (!isSquad(msg.sender)) revert NotSquad();\n        _;\n"},{"oldText":"    mapping(uint256 => mapping(address => bool)) public paid;\n\n","newText":"    mapping(uint256 => mapping(address => bool)) public paid;\n    mapping(address => bool) public cappedAtStart; // Reliable when the squad started (tier is not re-read later)\n\n"},{"oldText":"        if (msg.sender == organizer) revert OrganizerCannotLeave();\n        uint256 n = members.length;\n","newText":"        if (msg.sender == organizer) revert OrganizerCannotLeave();\n        _removeMember(msg.sender);\n    }\n\n    /// Organizer removes a stranger who used a leaked invite code. Open phase only.\n    function remove(address m) external inState(State.Open) {\n        if (msg.sender != organizer) revert NotOrganizer();\n        if (!isMember[m]) revert NotMember();\n        if (m == organizer) revert OrganizerCannotLeave();\n        _removeMember(m);\n    }\n\n    function _removeMember(address m) internal {\n        uint256 n = members.length;\n"},{"oldText":"            if (members[i] == msg.sender) {\n","newText":"            if (members[i] == m) {\n"},{"oldText":"        isMember[msg.sender] = false;\n        factory.noteMembership(msg.sender, false);\n        emit Left(msg.sender);\n","newText":"        isMember[m] = false;\n        factory.noteMembership(m, false);\n        emit Left(m);\n"},{"oldText":"Expected: 22 tests pass (7 registry + 7 factory + 8 setup).\n","newText":"Expected: 24 tests pass (8 registry + 7 factory + 9 setup).\n"},{"oldText":"        if (s.state() == Squad.State.Depositing) {\n            vm.prank(users[0]);\n            vm.expectRevert(Squad.NotOrganizer.selector); // dropped organizer cannot cancel\n            s.cancel();\n        }\n        // members whose turn moved up owe more, so a new window may be open; lock and confirm Active\n        _lockAll(s);\n","newText":"        // Requirements never rise after a drop, so the squad activates immediately.\n"},{"oldText":"        _sortByTrust();\n        _assignTurnsAndDeposits();\n","newText":"        _sortByTrust();\n        for (uint256 i; i < members.length; i++) cappedAtStart[members[i]] = trust.tier(members[i]) == RELIABLE;\n        _assignTurnsAndDeposits();\n"},{"oldText":"        if (trust.tier(m) == RELIABLE && full > 3 * c) full = 3 * c;\n","newText":"        if (cappedAtStart[m] && full > 3 * c) full = 3 * c;\n"},{"oldText":"        if (_allLocked()) _activate();\n        else depositDeadline = uint64(block.timestamp + depositWindow);\n","newText":"        // Dropping members only moves turns up in a smaller squad, so c*(n-p) never rises\n        // and the cap was fixed at start: every kept member is fully locked.\n        _activate();\n"},{"oldText":"Expected: 17 tests pass.\n","newText":"Expected: 18 tests pass.\n"},{"oldText":"        assertEq(late, 1);\n    }\n","newText":"        assertEq(late, 1);\n    }\n\n    function test_cannotPayAheadAfterEarlyAutoSettle() public {\n        Squad s = _active(3, C);\n        _payAllExcept(s, address(0)); // round 1 auto-settles immediately\n        uint64 opensAt = s.roundDeadline() - s.roundLength();\n        vm.prank(_turn(s, 2));\n        vm.expectRevert(abi.encodeWithSelector(Squad.RoundNotOpen.selector, opensAt));\n        s.contribute();\n        vm.warp(opensAt);\n        vm.prank(_turn(s, 2));\n        s.contribute();\n    }\n"},{"oldText":"    error TooEarly(uint64 settleableAfter);\n    error AlreadySettled();\n","newText":"    error TooEarly(uint64 settleableAfter);\n    error RoundNotOpen(uint64 opensAt);\n    error AlreadySettled();\n"},{"oldText":"        if (block.timestamp > settleableAfter()) revert PastGrace();\n        token.safeTransferFrom(msg.sender, address(this), contribution);\n","newText":"        if (block.timestamp > settleableAfter()) revert PastGrace();\n        // A round opens on schedule even when the previous one auto-settled early:\n        // no paying ahead, so trust can't be farmed by racing through rounds in one block.\n        if (block.timestamp < roundDeadline - roundLength) revert RoundNotOpen(roundDeadline - roundLength);\n        token.safeTransferFrom(msg.sender, address(this), contribution);\n"},{"oldText":"    function _stop(address m, uint8 r, uint256 n) internal {\n        stoppedPaying[m] = true;\n","newText":"    function _stop(address m, uint8 r, uint256 n) internal {\n        if (countsForTrust) trust.recordMiss(m); // the stopping round is a miss too\n        stoppedPaying[m] = true;\n"},{"oldText":"Expected: 18 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).\n","newText":"Expected: 19 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).\n"},{"oldText":"Expected: 54 tests pass (5 token + 7 registry + 7 factory + 17 setup + 18 rounds).\n","newText":"Expected: 57 tests pass (5 token + 8 registry + 7 factory + 18 setup + 19 rounds).\n"},{"oldText":"        if (block.timestamp > uint256(s.roundDeadline()) + s.grace()) return;\n        vm.prank(m);\n","newText":"        if (block.timestamp > uint256(s.roundDeadline()) + s.grace()) return;\n        if (block.timestamp < uint256(s.roundDeadline()) - s.roundLength()) return; // round not open yet\n        vm.prank(m);\n"},{"oldText":"| `NotOrganizer()` | Non-organizer (or dropped organizer) tried start/cancel | Only the organizer can do this |\n","newText":"| `NotOrganizer()` | Non-organizer (or dropped organizer) tried start/cancel/remove | Only the organizer can do this |\n"},{"oldText":"| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |\n| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |\n","newText":"| `TooEarly(settleableAfter)` | Settling before the deadline and grace pass | Wait until `settleableAfter` |\n| `RoundNotOpen(opensAt)` | Paying for a round before it opens | Wait until `opensAt` |\n| `AlreadySettled()` | Round already settled | Nothing to do (safe for cron retries) |\n"}]} -->

<!-- autoplan-accepted:eng -->
- Squad.contribute reverts RoundNotOpen(roundDeadline - roundLength) before a round opens; test_cannotPayAheadAfterEarlyAutoSettle; test helpers and the invariant handler warp or skip until the round opens.
- TrustRegistry stores factoryOf[squad]; isSquad(squad) is a view returning isWriter[factoryOf[squad]]; revoking a factory blocks its squads (test_revokedFactorySquadsCannotWrite).
- _stop records a miss when countsForTrust.
- Organizer remove(address) while Open via shared _removeMember (test_organizerRemovesMemberWhileOpen).
- Reliable cap decided at start (cappedAtStart); finalizeDeposits always activates after drops; dead re-open branch removed.
- README error catalogue adds RoundNotOpen(opensAt).
- Test counts supersede earlier blocks: 5 token, 8 registry, 7 factory, 18 setup, 19 rounds, 57 tests plus 2 invariants.
<!-- /autoplan-accepted:eng -->

| 21 | Eng | No paying ahead (`RoundNotOpen`) | Mechanical | P1 | blocks same-block farming | none |
| 22 | Eng | Registry revocation via `factoryOf` | Mechanical | P1 | recovery story must hold | `isSquad` mapping |
| 23 | Eng | `_stop` records miss | Mechanical | P1 | stopping must hurt trust | silent stop |
| 24 | Eng | Organizer `remove()` | Mechanical | P2 | invite squatting | cancel only |
| 25 | Eng | Cap fixed at start | Mechanical | P5 | removes dead branch | re-read tier |
| 26 | Eng | Demo-period trust / Reliable cap | **User Challenge** | — | sybil steal still works | — |

### Final gate (2026-10-02)
User chose **A**: Demo-period squads never write trust (`TRUST_MIN_ROUND_LENGTH = 604800`), and the Reliable 3c cap stays. Tests updated: `test_lateContributionRecordedLate` and `test_completedRecordedOnlyForBigEnoughSquads` use Weekly squads, and the latter also asserts that a Demo squad writes nothing. Status: **APPROVED**.
