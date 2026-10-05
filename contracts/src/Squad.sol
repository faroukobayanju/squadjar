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
    event Started(address[] order);
    event DepositLocked(address indexed member, uint256 amount);
    event Dropped(address indexed member);
    event Activated(uint64 roundDeadline);

    error WrongState(State current);
    error NotOrganizer();
    error NotMember();
    error AlreadyMember();
    error Full();
    error OrganizerCannotLeave();
    error BadInvite();
    error TooFewMembers();
    error NothingOwed();
    error DepositWindowOpen();

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
}
