# Squadjar Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the onchain core of Squadjar: a test naira token, a factory that holds trust records, and a per-squad contract that collects contributions, covers misses from deposits, and pays each round's collector.

**Architecture:**
- `SquadFactory` deploys one `Squad` per group and is the only writer of the global trust record.
- `Squad` is a state machine (Open, Depositing, Active, Completed, Cancelled) that holds the jar.
- All money moves are ERC-20 transfers of `AjoNGN`, which has no hooks.

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
- `recordCompleted` only when `n >= 5` and `c >= 1000e18`, and only for members with zero misses who did not stop paying.
- Contracts are not upgradeable. Fixes mean redeploying.

## Review Focus

1. A member who stops paying **before** collecting, while the jar has little deposit liquidity: settle must never revert, and fronting is capped by `totalLocked - frontedTotal` (test: `test_frontingCappedByLiquidity`).
2. `settleRound` called very late (after several round lengths): the next deadline must be in the future, not in the past (test: `test_lateSettleSchedulesFutureDeadline`).
3. The organizer is dropped during `finalizeDeposits`: the squad continues and nothing reverts (test: `test_organizerDroppedSquadContinues`).
4. Rounding when a stopped member's deposit doesn't divide evenly: the squad ends with a balance of exactly 0 (fuzz invariant plus `test_reliableStopperReducesLaterPayouts`).
5. `contribute` called by a member after they were marked stopped paying: it reverts and doesn't double count (test: `test_stoppedMemberCannotContribute`).

---

## File Structure

| File | Responsibility |
|---|---|
| `contracts/foundry.toml` | Foundry config, remappings, Monad RPC alias |
| `contracts/src/AjoNGN.sol` | Test naira ERC-20 with capped faucet |
| `contracts/src/ITrust.sol` | Interface the squad uses to read and write trust |
| `contracts/src/SquadFactory.sol` | Creates squads, timing presets, trust records |
| `contracts/src/Squad.sol` | One squad's jar and full lifecycle |
| `contracts/test/Base.t.sol` | Shared setup and helpers |
| `contracts/test/AjoNGN.t.sol` | Token tests |
| `contracts/test/SquadFactory.t.sol` | Factory and trust tests |
| `contracts/test/SquadSetup.t.sol` | Open and Depositing phase tests |
| `contracts/test/SquadRounds.t.sol` | Active phase, settlement, end tests |
| `contracts/test/Invariant.t.sol` | Balance conservation fuzz |
| `contracts/script/Deploy.s.sol` | Deploys the token and factory |
| `contracts/deployments/monad-testnet.json` | Deployed addresses (written by hand after deploy) |
| `contracts/abi/*.json` | ABIs exported for the app |

---

### Task 1: Foundry project and AjoNGN token

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/AjoNGN.sol`, `contracts/test/AjoNGN.t.sol`

**Interfaces:**
- Produces: `AjoNGN` (OZ ERC20) with `faucet(uint256 amount)`, `FAUCET_MAX = 200_000e18`, error `FaucetCapExceeded()`.

- [ ] **Step 1: Scaffold Foundry and install dependencies**

```bash
cd /Users/zorak/Desktop/metropolis
forge init contracts --no-git
cd contracts
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std
```

- [ ] **Step 2: Write `contracts/foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
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

/// Test naira for Monad testnet. Shown in the app as ₦.
contract AjoNGN is ERC20 {
    uint256 public constant FAUCET_MAX = 200_000e18;

    error FaucetCapExceeded();

    constructor() ERC20("Squadjar Naira", "sNGN") {}

    function faucet(uint256 amount) external {
        if (amount > FAUCET_MAX) revert FaucetCapExceeded();
        _mint(msg.sender, amount);
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd contracts && forge test --match-contract AjoNGNTest`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/zorak/Desktop/metropolis
git add contracts/foundry.toml contracts/src/AjoNGN.sol contracts/test/AjoNGN.t.sol contracts/lib .gitmodules
git commit -m "feat(contracts): add AjoNGN test naira with capped faucet"
```

---

### Task 2: Factory, trust records, and the squad's Open phase

**Files:**
- Create: `contracts/src/ITrust.sol`, `contracts/src/SquadFactory.sol`, `contracts/src/Squad.sol`, `contracts/test/Base.t.sol`, `contracts/test/SquadFactory.t.sol`, `contracts/test/SquadSetup.t.sol`

**Interfaces:**
- Consumes: `AjoNGN` from Task 1.
- Produces:
  - `SquadFactory(IERC20 token)`
  - `enum Period { Demo, Weekly, Monthly }`
  - `createSquad(uint256 contribution, uint8 maxMembers, Period period) returns (address)`
  - `timing(Period) pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow)`
  - `isSquad(address) returns (bool)`
  - `records(address) returns (uint32 onTime, uint32 late, uint32 missed, uint32 completed)`
  - `trustScore(address) returns (int256)`
  - `tier(address) returns (uint8)`
  - `recordContribution(address,bool)`, `recordMiss(address)`, `recordCompleted(address)`, all `onlySquad`
  - `Squad`: `enum State { Open, Depositing, Active, Completed, Cancelled }`, `join()`, `leave()`, `cancel()`, `memberCount()`, `memberAt(uint256)`, `isMember(address)`, `organizer()`, `state()`
  - Errors: `WrongState()`, `NotOrganizer()`, `NotMember()`, `AlreadyMember()`, `Full()`, `OrganizerCannotLeave()`

- [ ] **Step 1: Write `contracts/src/ITrust.sol`**

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
```

- [ ] **Step 2: Write the shared test base `contracts/test/Base.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

abstract contract Base is Test {
    AjoNGN token;
    SquadFactory factory;
    address[] users;
    uint256 constant C = 1000e18;

    function setUp() public virtual {
        token = new AjoNGN();
        factory = new SquadFactory(token);
        for (uint256 i; i < 6; i++) {
            address u = makeAddr(string.concat("user", vm.toString(i)));
            users.push(u);
            vm.prank(u);
            token.faucet(200_000e18);
        }
    }

    /// users[0] organizes; users[1..n-1] join. Everyone approves the squad.
    function _squad(uint256 n, uint256 c) internal returns (Squad s) {
        vm.prank(users[0]);
        s = Squad(factory.createSquad(c, uint8(n), SquadFactory.Period.Demo));
        vm.prank(users[0]);
        token.approve(address(s), type(uint256).max);
        for (uint256 i = 1; i < n; i++) {
            vm.startPrank(users[i]);
            token.approve(address(s), type(uint256).max);
            s.join();
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

    /// Gives `u` a trust score of 20 (Reliable) through a throwaway squad.
    function _makeReliable(address u) internal {
        vm.prank(users[5]);
        address dummy = factory.createSquad(C, 3, SquadFactory.Period.Demo);
        vm.startPrank(dummy);
        for (uint256 i; i < 20; i++) factory.recordContribution(u, false);
        vm.stopPrank();
    }
}
```

- [ ] **Step 3: Write the failing factory tests `contracts/test/SquadFactory.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

contract SquadFactoryTest is Base {
    function test_createSquadRegistersAndSetsOrganizer() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Weekly);
        assertTrue(factory.isSquad(s));
        assertEq(Squad(s).organizer(), users[0]);
        assertEq(Squad(s).memberCount(), 1);
        assertEq(Squad(s).roundLength(), 604800);
        assertEq(Squad(s).grace(), 43200);
        assertEq(Squad(s).depositWindow(), 172800);
    }

    function test_createSquadRejectsSmallContribution() public {
        vm.expectRevert(SquadFactory.BadParams.selector);
        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo);
    }

    function test_createSquadRejectsSizeOutOfRange() public {
        vm.expectRevert(SquadFactory.BadParams.selector);
        factory.createSquad(C, 2, SquadFactory.Period.Demo);
        vm.expectRevert(SquadFactory.BadParams.selector);
        factory.createSquad(C, 21, SquadFactory.Period.Demo);
    }

    function test_timingPresets() public view {
        (uint32 rl, uint32 g, uint32 dw) = factory.timing(SquadFactory.Period.Demo);
        assertEq(rl, 300); assertEq(g, 60); assertEq(dw, 300);
        (rl, g, dw) = factory.timing(SquadFactory.Period.Monthly);
        assertEq(rl, 2592000); assertEq(g, 172800); assertEq(dw, 259200);
    }

    function test_recordsOnlyFromSquads() public {
        vm.expectRevert(SquadFactory.NotSquad.selector);
        factory.recordMiss(users[1]);
    }

    function test_trustScoreMathAndTiers() public {
        vm.prank(users[5]);
        address s = factory.createSquad(C, 3, SquadFactory.Period.Demo);
        address u = users[1];
        assertEq(factory.tier(u), 0);
        vm.startPrank(s);
        for (uint256 i; i < 6; i++) factory.recordContribution(u, false); // +6
        assertEq(factory.trustScore(u), 6);
        assertEq(factory.tier(u), 1);
        factory.recordContribution(u, true); // -2
        factory.recordCompleted(u);          // +3
        assertEq(factory.trustScore(u), 7);
        factory.recordMiss(u);               // -10
        assertEq(factory.trustScore(u), -3);
        assertEq(factory.tier(u), 0);
        vm.stopPrank();
    }
}
```

- [ ] **Step 4: Write the failing Open-phase tests `contracts/test/SquadSetup.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Squad} from "../src/Squad.sol";

contract SquadSetupTest is Base {
    function test_joinAddsMember() public {
        Squad s = _squad(3, C);
        assertEq(s.memberCount(), 3);
        assertTrue(s.isMember(users[2]));
    }

    function test_joinRevertsWhenFull() public {
        Squad s = _squad(3, C);
        vm.prank(users[3]);
        vm.expectRevert(Squad.Full.selector);
        s.join();
    }

    function test_joinRevertsForExistingMember() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(Squad.AlreadyMember.selector);
        s.join();
    }

    function test_leaveRemovesMember() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        s.leave();
        assertFalse(s.isMember(users[1]));
        assertEq(s.memberCount(), 2);
    }

    function test_organizerCannotLeave() public {
        Squad s = _squad(3, C);
        vm.prank(users[0]);
        vm.expectRevert(Squad.OrganizerCannotLeave.selector);
        s.leave();
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

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd contracts && forge test --match-contract "SquadFactoryTest|SquadSetupTest"`
Expected: compile error, `Source "src/SquadFactory.sol" not found`.

- [ ] **Step 6: Write `contracts/src/SquadFactory.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITrust} from "./ITrust.sol";
import {Squad} from "./Squad.sol";

contract SquadFactory is ITrust {
    enum Period { Demo, Weekly, Monthly }

    struct Record {
        uint32 onTime;
        uint32 late;
        uint32 missed;
        uint32 completed;
    }

    IERC20 public immutable token;
    mapping(address => bool) public isSquad;
    mapping(address => Record) public records;
    address[] public squads;

    event SquadCreated(
        address indexed squad, address indexed organizer, uint256 contribution, uint8 maxMembers, Period period
    );

    error BadParams();
    error NotSquad();

    modifier onlySquad() {
        if (!isSquad[msg.sender]) revert NotSquad();
        _;
    }

    constructor(IERC20 _token) {
        token = _token;
    }

    function timing(Period p) public pure returns (uint32 roundLength, uint32 grace, uint32 depositWindow) {
        if (p == Period.Demo) return (300, 60, 300);
        if (p == Period.Weekly) return (604800, 43200, 172800);
        return (2592000, 172800, 259200);
    }

    function createSquad(uint256 contribution, uint8 maxMembers, Period period) external returns (address) {
        if (contribution < 100e18 || maxMembers < 3 || maxMembers > 20) revert BadParams();
        (uint32 rl, uint32 g, uint32 dw) = timing(period);
        Squad s = new Squad(token, ITrust(address(this)), msg.sender, contribution, maxMembers, rl, g, dw);
        isSquad[address(s)] = true;
        squads.push(address(s));
        emit SquadCreated(address(s), msg.sender, contribution, maxMembers, period);
        return address(s);
    }

    function squadCount() external view returns (uint256) {
        return squads.length;
    }

    function trustScore(address user) public view returns (int256) {
        Record memory r = records[user];
        return int256(uint256(r.onTime)) - 2 * int256(uint256(r.late)) - 10 * int256(uint256(r.missed))
            + 3 * int256(uint256(r.completed));
    }

    function tier(address user) external view returns (uint8) {
        int256 s = trustScore(user);
        if (s >= 20) return 2;
        if (s >= 5) return 1;
        return 0;
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

- [ ] **Step 7: Write `contracts/src/Squad.sol` (storage plus Open phase; later tasks add to this file)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITrust} from "./ITrust.sol";

/// One squad's jar. No member controls the money once rounds begin.
contract Squad {
    using SafeERC20 for IERC20;

    enum State { Open, Depositing, Active, Completed, Cancelled }

    uint8 public constant RELIABLE = 2;
    uint256 public constant COMPLETED_MIN_MEMBERS = 5;
    uint256 public constant COMPLETED_MIN_CONTRIBUTION = 1000e18;

    IERC20 public immutable token;
    ITrust public immutable factory;
    address public immutable organizer;
    uint256 public immutable contribution;
    uint8 public immutable maxMembers;
    uint32 public immutable roundLength;
    uint32 public immutable grace;
    uint32 public immutable depositWindow;

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

    error WrongState();
    error NotOrganizer();
    error NotMember();
    error AlreadyMember();
    error Full();
    error OrganizerCannotLeave();

    modifier inState(State s) {
        if (state != s) revert WrongState();
        _;
    }

    modifier onlyMember() {
        if (!isMember[msg.sender]) revert NotMember();
        _;
    }

    constructor(
        IERC20 _token,
        ITrust _factory,
        address _organizer,
        uint256 _contribution,
        uint8 _maxMembers,
        uint32 _roundLength,
        uint32 _grace,
        uint32 _depositWindow
    ) {
        token = _token;
        factory = _factory;
        organizer = _organizer;
        contribution = _contribution;
        maxMembers = _maxMembers;
        roundLength = _roundLength;
        grace = _grace;
        depositWindow = _depositWindow;
        members.push(_organizer);
        isMember[_organizer] = true;
        emit Joined(_organizer);
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function memberAt(uint256 i) external view returns (address) {
        return members[i];
    }

    function join() external inState(State.Open) {
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= maxMembers) revert Full();
        members.push(msg.sender);
        isMember[msg.sender] = true;
        emit Joined(msg.sender);
    }

    function leave() external inState(State.Open) onlyMember {
        if (msg.sender == organizer) revert OrganizerCannotLeave();
        uint256 n = members.length;
        for (uint256 i; i < n; i++) {
            if (members[i] == msg.sender) {
                members[i] = members[n - 1];
                members.pop();
                break;
            }
        }
        isMember[msg.sender] = false;
        emit Left(msg.sender);
    }

    function cancel() external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (state != State.Open && state != State.Depositing) revert WrongState();
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

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract "SquadFactoryTest|SquadSetupTest"`
Expected: 12 tests pass.

- [ ] **Step 9: Commit**

```bash
git add contracts/src contracts/test
git commit -m "feat(contracts): add SquadFactory with trust records and squad Open phase"
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
  - `requiredDepositFor(address,uint256 n,uint256 p) view returns (uint256)`
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
        // members whose turn moved up owe more, so a new window may be open; lock and confirm Active
        _lockAll(s);
        assertEq(uint8(s.state()), uint8(Squad.State.Active));
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
        _assignTurnsAndDeposits();
        state = State.Depositing;
        depositDeadline = uint64(block.timestamp + depositWindow);
        emit Started(members);
    }

    function requiredDepositFor(address m, uint256 n, uint256 p) public view returns (uint256) {
        uint256 c = contribution;
        uint256 full = c * (n - p);
        if (factory.tier(m) == RELIABLE && full > 3 * c) full = 3 * c;
        return full < c ? c : full;
    }

    function lockDeposit() external inState(State.Depositing) onlyMember {
        uint256 amt = required[msg.sender] - locked[msg.sender];
        if (amt == 0) revert NothingOwed();
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
        if (_allLocked()) _activate();
        else depositDeadline = uint64(block.timestamp + depositWindow);
    }

    function _sortByTrust() internal {
        uint256 n = members.length;
        int256[] memory score = new int256[](n);
        bytes32[] memory key = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            score[i] = factory.trustScore(members[i]);
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
            required[m] = requiredDepositFor(m, n, i + 1);
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
        currentRound = 1;
        roundDeadline = uint64(block.timestamp + roundLength);
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
Expected: 15 tests pass.

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
  - `struct SquadView { State state; uint256 contribution; uint8 maxMembers; uint32 roundLength; uint32 grace; uint64 depositDeadline; uint64 roundDeadline; uint8 currentRound; address organizer; address[] members; uint256[] locked; uint256[] required; bool[] paidThisRound; bool[] stopped; uint8[] misses; }`. Turn equals array index + 1 after start.

- [ ] **Step 1: Write the failing tests `contracts/test/SquadRounds.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Squad} from "../src/Squad.sol";

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
        Squad s = _active(3, C);
        address m = _turn(s, 2);
        vm.warp(uint256(s.roundDeadline()) + 10);
        vm.prank(m);
        s.contribute();
        (, uint32 late,,) = factory.records(m);
        assertEq(late, 1);
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
        vm.expectRevert(Squad.TooEarly.selector);
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
        (,, uint32 missed,) = factory.records(t1);
        assertEq(missed, 1);
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
        (,,, uint32 doneSmall) = factory.records(users[1]);
        assertEq(doneSmall, 0);

        Squad big = _squad(5, C); // new squad, same users
        _start(big);
        _lockAll(big);
        for (uint256 r; r < 5; r++) _payAllExcept(big, address(0));
        (,,, uint32 doneBig) = factory.records(users[1]);
        assertEq(doneBig, 1);
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
    }

    event Contributed(address indexed member, uint8 round, bool late);
    event RoundSettled(uint8 round, address indexed collector, uint256 amount, address[] missed);
    event StoppedPaying(address indexed member);
    event Completed();

    error AlreadyPaid();
    error PastGrace();
    error MemberStoppedPaying();
    error TooEarly();
    error AlreadySettled();

    function contribute() external inState(State.Active) onlyMember {
        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();
        uint8 r = currentRound;
        if (paid[r][msg.sender]) revert AlreadyPaid();
        if (block.timestamp > uint256(roundDeadline) + grace) revert PastGrace();
        token.safeTransferFrom(msg.sender, address(this), contribution);
        paid[r][msg.sender] = true;
        paidCount++;
        roundContributions += contribution;
        bool late = block.timestamp > roundDeadline;
        factory.recordContribution(msg.sender, late);
        emit Contributed(msg.sender, r, late);
        if (paidCount == activeCount) _settle();
    }

    function refillDeposit() external inState(State.Active) onlyMember {
        if (stoppedPaying[msg.sender]) revert MemberStoppedPaying();
        uint256 amt = required[msg.sender] - locked[msg.sender];
        if (amt == 0) revert NothingOwed();
        _pullDeposit(msg.sender, amt);
        refillBy[msg.sender] = 0;
        emit DepositLocked(msg.sender, amt);
    }

    /// Anyone may call. `round` makes repeated cron calls safe.
    function settleRound(uint8 round) external {
        if (state == State.Completed || (state == State.Active && round < currentRound)) revert AlreadySettled();
        if (state != State.Active) revert WrongState();
        if (round > currentRound) revert TooEarly();
        if (paidCount < activeCount && block.timestamp <= uint256(roundDeadline) + grace) revert TooEarly();
        _settle();
    }

    function _settle() internal {
        uint8 r = currentRound;
        uint256 n = members.length;
        uint256 c = contribution;
        uint256 pot = roundContributions;
        address[] memory missed = new address[](n);
        uint256 mc;

        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (
                !stoppedPaying[m] && refillBy[m] != 0 && refillBy[m] <= r && locked[m] < required[m]
            ) _stop(m, r, n);
            if (paid[r][m]) continue;
            missed[mc++] = m;
            if (!stoppedPaying[m]) {
                factory.recordMiss(m);
                missCount[m]++;
                refillBy[m] = r + 1;
                pot += _cover(m, c, turnOf[m] >= r);
            } else if (turnOf[m] >= r) {
                pot += _cover(m, c, true);
            } else {
                uint256 cap = r == n ? c : (coverPerRound[m] < c ? coverPerRound[m] : c);
                pot += _cover(m, cap, false);
            }
        }

        address collector = members[r - 1];
        uint256 gross = pot;
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
        stoppedPaying[m] = true;
        activeCount--;
        if (turnOf[m] < r) coverPerRound[m] = locked[m] / (n - r + 1);
        emit StoppedPaying(m);
    }

    function _finish() internal {
        uint256 n = members.length;
        uint256 forfeit;
        uint256 honest;
        uint256 nonStopped;
        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (stoppedPaying[m]) {
                forfeit += locked[m];
                totalLocked -= locked[m];
                locked[m] = 0;
            } else {
                nonStopped++;
                if (missCount[m] == 0) honest++;
            }
        }
        uint256 cut;
        if (frontedTotal > forfeit) {
            uint256 deficit = frontedTotal - forfeit;
            forfeit = 0;
            if (nonStopped > 0) cut = (deficit + nonStopped - 1) / nonStopped;
        } else {
            forfeit -= frontedTotal;
        }
        frontedTotal = 0;

        uint256 share = honest > 0 ? forfeit / honest : 0;
        bool eligible = n >= COMPLETED_MIN_MEMBERS && contribution >= COMPLETED_MIN_CONTRIBUTION;
        state = State.Completed;

        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (stoppedPaying[m]) continue;
            uint256 amt = locked[m];
            locked[m] = 0;
            totalLocked -= amt;
            amt = amt > cut ? amt - cut : 0;
            if (missCount[m] == 0) {
                amt += share;
                if (eligible) factory.recordCompleted(m);
            }
            if (amt > 0) token.safeTransfer(m, amt);
        }
        uint256 dust = token.balanceOf(address(this));
        if (dust > 0) token.safeTransfer(members[n - 1], dust);
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
        for (uint256 i; i < n; i++) {
            address m = members[i];
            v.members[i] = m;
            v.locked[i] = locked[m];
            v.required[i] = required[m];
            v.paidThisRound[i] = paid[currentRound][m];
            v.stopped[i] = stoppedPaying[m];
            v.misses[i] = missCount[m];
        }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract SquadRoundsTest -vv`
Expected: 15 tests pass. If `test_reliableStopperReducesLaterPayouts` is off by 1 wei, check that `coverPerRound` uses `n - r + 1` with `r = 3` (2c / 3).

- [ ] **Step 5: Run the full suite**

Run: `cd contracts && forge test`
Expected: 34 tests pass.

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
}

contract InvariantTest is Test {
    AjoNGN token;
    SquadFactory factory;
    Squad s;
    Handler handler;

    function setUp() public {
        token = new AjoNGN();
        factory = new SquadFactory(token);
        address[] memory us = new address[](5);
        for (uint256 i; i < 5; i++) {
            us[i] = makeAddr(string.concat("m", vm.toString(i)));
            vm.prank(us[i]);
            token.faucet(200_000e18);
        }
        vm.prank(us[0]);
        s = Squad(factory.createSquad(1000e18, 5, SquadFactory.Period.Demo));
        for (uint256 i; i < 5; i++) {
            vm.startPrank(us[i]);
            token.approve(address(s), type(uint256).max);
            if (i > 0) s.join();
            vm.stopPrank();
        }
        vm.prank(us[0]);
        s.start();
        for (uint256 i; i < 5; i++) {
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
Expected: 2 invariants pass across 256 runs × depth 60. If one fails, forge prints the call sequence. Fix `_settle` or `_cover` in `Squad.sol`, not the test.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/Invariant.t.sol
git commit -m "test(contracts): jar balance conservation invariant"
```

---

### Task 6: Deploy to Monad testnet and export ABIs

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `contracts/.env.example`, `contracts/deployments/monad-testnet.json`, `contracts/abi/AjoNGN.json`, `contracts/abi/SquadFactory.json`, `contracts/abi/Squad.json`

**Interfaces:**
- Produces:
  - `contracts/deployments/monad-testnet.json` shaped as `{"chainId":10143,"token":"0x…","factory":"0x…","deployBlock":N}`
  - ABI JSON files consumed by the app plan

- [ ] **Step 1: Write `contracts/script/Deploy.s.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));
        AjoNGN token = new AjoNGN();
        SquadFactory factory = new SquadFactory(token);
        vm.stopBroadcast();
        console2.log("token", address(token));
        console2.log("factory", address(factory));
    }
}
```

- [ ] **Step 2: Write `contracts/.env.example`**

```bash
# Testnet-only key funded from the Monad testnet faucet. Never a mainnet key.
DEPLOYER_KEY=0x
```

- [ ] **Step 3: Fund the deployer (human step)**

Create a fresh testnet key with `cast wallet new`, put it in `contracts/.env` (gitignored), and get testnet MON from the Monad testnet faucet listed at https://docs.monad.xyz.

- [ ] **Step 4: Deploy**

```bash
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
```

Expected: the log prints `token 0x…` and `factory 0x…`.

- [ ] **Step 5: Smoke test onchain**

```bash
cast call <factory> "timing(uint8)(uint32,uint32,uint32)" 0 --rpc-url monad_testnet
```

Expected: `300 60 300`.

- [ ] **Step 6: Record addresses and export ABIs**

Write `contracts/deployments/monad-testnet.json` using the printed addresses and the block number from `broadcast/Deploy.s.sol/10143/run-latest.json` (`receipts[0].blockNumber`, converted from hex). Then:

```bash
mkdir -p abi
forge inspect AjoNGN abi --json > abi/AjoNGN.json
forge inspect SquadFactory abi --json > abi/SquadFactory.json
forge inspect Squad abi --json > abi/Squad.json
```

- [ ] **Step 7: Commit**

```bash
git add contracts/script contracts/.env.example contracts/deployments contracts/abi
git commit -m "chore(contracts): deploy to Monad testnet and export ABIs"
git push
```

---

## After this plan

- **Plan 2 (app + settlement)** starts with the Privy sponsorship and server-wallet spike, and is written after it. It covers spec child issues #3, #4, #5.
- **Plan 3 (Kimi)** covers child issue #6.
