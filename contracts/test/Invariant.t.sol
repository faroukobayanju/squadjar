// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

contract Handler is Test {
    Squad public s;

    constructor(Squad _s) {
        s = _s;
    }

    function contribute(uint256 who) external {
        if (s.state() != Squad.State.Active) return;
        address m = s.memberAt(who % s.memberCount());
        if (s.paid(s.currentRound(), m)) return;
        if (block.timestamp > uint256(s.roundDeadline()) + s.grace()) return;
        if (block.timestamp < uint256(s.roundDeadline()) - s.roundLength()) return; // round not open yet
        vm.prank(m);
        s.contribute();
    }

    function skipAndSettle(uint256 secs) external {
        if (s.state() != Squad.State.Active) return;
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
        if (block.timestamp <= uint256(s.roundDeadline()) + s.grace()) return;
        s.settleRound(s.currentRound());
    }

    /// Everyone contributes this round, so _finish also runs with members who have no misses.
    function payRound() external {
        if (s.state() != Squad.State.Active) return;
        if (block.timestamp > uint256(s.roundDeadline()) + s.grace()) return;
        uint256 opensAt = uint256(s.roundDeadline()) - s.roundLength();
        if (block.timestamp < opensAt) vm.warp(opensAt); // rounds open on schedule
        uint8 r = s.currentRound();
        uint256 n = s.memberCount();
        for (uint256 i; i < n; i++) {
            address m = s.memberAt(i);
            if (s.paid(r, m)) continue;
            if (s.currentRound() != r || s.state() != Squad.State.Active) return; // auto-settled
            vm.prank(m);
            s.contribute();
        }
    }

    function payBack(uint256 who) external {
        if (s.state() != Squad.State.Active && s.state() != Squad.State.Completed) return;
        address m = s.memberAt(who % s.memberCount());
        if (s.owed(m) == 0) return;
        vm.prank(m);
        s.payBack();
    }

    /// Lets time pass with nobody paying, so members miss and build up debt.
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

    /// 6 members at ₦1000. Demo squad: writes no trust; exercises money paths only.
    /// m0 is Reliable and m1 is Building, so all three hold-back rates get exercised.
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
        for (uint256 i; i < 20; i++) registry.recordContribution(us[0], false);
        for (uint256 i; i < 10; i++) registry.recordContribution(us[1], false);
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
        handler = new Handler(s);
        targetContract(address(handler));
    }

    function invariant_jarMatchesAccounting() public view {
        uint256 bal = token.balanceOf(address(s));
        if (s.state() == Squad.State.Completed) {
            assertEq(bal, 0);
            assertEq(s.totalLocked(), 0);
        } else {
            assertEq(bal, s.totalLocked() + s.roundContributions());
        }
    }

    function invariant_debtEqualsCredit() public view {
        uint256 sumOwed;
        uint256 sumCredit;
        for (uint256 i; i < s.memberCount(); i++) {
            sumOwed += s.owed(s.memberAt(i));
            sumCredit += s.credit(s.memberAt(i));
        }
        assertEq(sumOwed, sumCredit);
    }

    function invariant_totalLockedIsSum() public view {
        uint256 sumLocked;
        for (uint256 i; i < s.memberCount(); i++) sumLocked += s.locked(s.memberAt(i));
        assertEq(sumLocked, s.totalLocked());
    }
}
