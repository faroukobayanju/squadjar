// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ITrust, IMembership} from "./ITrust.sol";

/// One squad's jar. No member controls the money once rounds begin.
/// No deposit to join: when a member collects, part of their payout is held in the jar until they
/// have paid the rounds they still owe. How much is held depends on their tier at start.
contract Squad {
    using SafeERC20 for IERC20;

    /// Depositing is never entered; it stays so the app's state numbers do not shift.
    enum State { Open, Depositing, Active, Completed, Cancelled }

    uint8 public constant BUILDING = 1;
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
    bytes32 public immutable inviteHash;
    uint64 public immutable firstDeadline; // round 1 deadline anchor (weekday/payday); 0 = start + roundLength

    State public state;
    address[] internal members; // join order while Open; turn order (index + 1) after start
    mapping(address => bool) public isMember;
    mapping(address => uint8) public turnOf;
    mapping(address => uint8) public allowanceOf; // % of a payout's remaining obligation not held: 0, 25 or 50
    mapping(address => uint256) public locked; // held from this member's payout; covers their later misses
    mapping(address => uint8) public missCount;
    mapping(address => uint256) public owed; // debt: missed contributions not yet paid back
    mapping(address => uint256) public credit; // what this collector was paid short and is still owed
    mapping(uint256 => mapping(address => bool)) public paid;

    bool public countsForTrust; // set at start: n >= 5, c >= 1000e18, Weekly or longer
    uint64 public roundDeadline;
    uint8 public currentRound;
    uint8 public paidCount;
    uint256 public roundContributions;
    uint256 public totalLocked;

    event Joined(address indexed member);
    event Left(address indexed member);
    event Cancelled();
    event Started(address[] order);
    event Activated(uint64 roundDeadline);
    event Contributed(address indexed member, uint8 round, bool late);
    event RoundSettled(uint8 round, address indexed collector, uint256 amount, address[] missed);
    event PayoutHeld(address indexed member, uint8 round, uint256 amount);
    event Completed();

    error WrongState(State current);
    error NotOrganizer();
    error NotMember();
    error AlreadyMember();
    error Full();
    error OrganizerCannotLeave();
    error BadInvite();
    error TooFewMembers();
    error NothingOwed();
    error AlreadyPaid();
    error PastGrace();
    error TooEarly(uint64 settleableAfter);
    error RoundNotOpen(uint64 opensAt);
    error AlreadySettled();

    struct SquadView {
        State state;
        uint256 contribution;
        uint8 maxMembers;
        uint32 roundLength;
        uint32 grace;
        uint64 roundDeadline;
        uint8 currentRound;
        address organizer;
        address[] members;
        uint256[] locked;
        uint8[] allowance;
        bool[] paidThisRound;
        uint8[] misses;
        uint256[] owed;
        uint256[] credit;
        bool countsForTrust;
        uint256 totalLocked;
        uint64 settleableAfter;
    }

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

    /// The jar holds no money while Open, so there is nothing to refund.
    function cancel() external inState(State.Open) {
        if (msg.sender != organizer) revert NotOrganizer();
        state = State.Cancelled;
        emit Cancelled();
    }

    function start() external inState(State.Open) {
        if (msg.sender != organizer) revert NotOrganizer();
        uint256 n = members.length;
        if (n < 3) revert TooFewMembers();
        _sortByTrust();
        for (uint256 i; i < n; i++) {
            address m = members[i];
            turnOf[m] = uint8(i + 1);
            uint8 t = trust.tier(m); // fixed at start, so a tier change mid-squad can't be gamed
            allowanceOf[m] = t == RELIABLE ? 50 : t == BUILDING ? 25 : 0;
        }
        emit Started(members);
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

    function _activate() internal {
        state = State.Active;
        // Demo squads (5-minute rounds) never write trust: otherwise sybils farm Reliable in an hour.
        countsForTrust = members.length >= TRUST_MIN_MEMBERS && contribution >= TRUST_MIN_CONTRIBUTION
            && roundLength >= TRUST_MIN_ROUND_LENGTH;
        currentRound = 1;
        uint64 d = firstDeadline;
        // Keep the chosen weekday/time: if the squad started past the anchor, roll forward whole rounds.
        if (d == 0) d = uint64(block.timestamp + roundLength);
        else if (d <= block.timestamp) d += uint64(((block.timestamp - d) / roundLength + 1) * roundLength);
        // Round 1 gets at least half a round, so a late start can't make it seconds long.
        if (d < block.timestamp + roundLength / 2) d += roundLength;
        roundDeadline = d;
        emit Activated(roundDeadline);
    }

    function contribute() external inState(State.Active) onlyMember {
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
        if (paidCount == members.length) _settle();
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
        if (paidCount < members.length && block.timestamp <= settleableAfter()) revert TooEarly(settleableAfter());
        _settle();
    }

    function _settle() internal {
        uint8 r = currentRound;
        uint256 n = members.length;
        uint256 c = contribution;
        uint256 pool = roundContributions;
        address collector = members[r - 1];
        address[] memory missed = new address[](n);
        uint256 mc;

        for (uint256 i; i < n; i++) {
            address m = members[i];
            if (paid[r][m]) continue;
            missed[mc++] = m;
            missCount[m]++;
            if (countsForTrust) trust.recordMiss(m);
        }

        // Hold back what the collector still owes, less their tier's allowance.
        uint256 held = c * (n - r) * (100 - allowanceOf[collector]) / 100;
        if (held > pool) held = pool;
        if (held > 0) {
            locked[collector] += held;
            totalLocked += held;
            pool -= held;
            emit PayoutHeld(collector, r, held);
        }

        roundContributions = 0;
        paidCount = 0;
        if (pool > 0) token.safeTransfer(collector, pool);

        address[] memory missedList = new address[](mc);
        for (uint256 i; i < mc; i++) missedList[i] = missed[i];
        emit RoundSettled(r, collector, pool, missedList);

        if (r == n) {
            _finish();
        } else {
            currentRound = r + 1;
            uint64 next = roundDeadline + roundLength;
            if (next <= block.timestamp) next += uint64(((block.timestamp - next) / roundLength + 1) * roundLength);
            // Same rule as round 1: a late settle can't leave members seconds to pay. Never fires on an
            // on-time settle, where the lead is at least roundLength - grace (> roundLength / 2 for every preset).
            if (next < block.timestamp + roundLength / 2) next += roundLength;
            roundDeadline = next;
        }
    }

    /// Ends the squad and returns every member's held money.
    function _finish() internal {
        state = State.Completed;
        uint256 n = members.length;
        for (uint256 i; i < n; i++) {
            address m = members[i];
            uint256 x = locked[m];
            locked[m] = 0;
            totalLocked -= x;
            if (missCount[m] == 0 && countsForTrust) trust.recordCompleted(m);
            if (x > 0) token.safeTransfer(m, x);
        }
        emit Completed();
    }

    function getState() external view returns (SquadView memory v) {
        uint256 n = members.length;
        v.state = state;
        v.contribution = contribution;
        v.maxMembers = maxMembers;
        v.roundLength = roundLength;
        v.grace = grace;
        v.roundDeadline = roundDeadline;
        v.currentRound = currentRound;
        v.organizer = organizer;
        v.members = new address[](n);
        v.locked = new uint256[](n);
        v.allowance = new uint8[](n);
        v.paidThisRound = new bool[](n);
        v.misses = new uint8[](n);
        v.owed = new uint256[](n);
        v.credit = new uint256[](n);
        v.countsForTrust = countsForTrust;
        v.totalLocked = totalLocked;
        v.settleableAfter = settleableAfter();
        for (uint256 i; i < n; i++) {
            address m = members[i];
            v.members[i] = m;
            v.locked[i] = locked[m];
            v.allowance[i] = allowanceOf[m];
            v.paidThisRound[i] = paid[currentRound][m];
            v.misses[i] = missCount[m];
            v.owed[i] = owed[m];
            v.credit[i] = credit[m];
        }
    }
}
