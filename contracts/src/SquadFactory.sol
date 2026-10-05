// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITrust, IMembership} from "./ITrust.sol";
import {TrustRegistry} from "./TrustRegistry.sol";
import {Squad} from "./Squad.sol";

contract SquadFactory is IMembership {
    enum Period { Demo, Weekly, Monthly }

    uint64 public constant MAX_FIRST_DEADLINE_DELAY = 60 days;

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
    error DeadlineTooFar();
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
        if (firstDeadline != 0 && firstDeadline > block.timestamp + MAX_FIRST_DEADLINE_DELAY) revert DeadlineTooFar();
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
