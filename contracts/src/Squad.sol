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
