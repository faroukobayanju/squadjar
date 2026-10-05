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
