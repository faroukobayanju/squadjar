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
        // The remaining 3 members play every round to the end and the jar empties.
        for (uint256 r; r < 3; r++) _payAllExcept(s, address(0));
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(token.balanceOf(address(s)), 0);
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

    function test_roundOneNotOpenBeforeAnchor() public {
        uint64 anchor = uint64(block.timestamp + 1000);
        Squad s = _anchored(anchor);
        _lockAll(s);
        assertEq(s.roundDeadline(), anchor);

        address m = s.memberAt(0);
        vm.prank(m);
        vm.expectRevert(abi.encodeWithSelector(Squad.RoundNotOpen.selector, anchor - 300));
        s.contribute();

        vm.warp(anchor - 300);
        vm.prank(m);
        s.contribute();
        assertTrue(s.paid(1, m));
    }

    function test_firstDeadlineRollsForwardWholeRounds() public {
        uint64 anchor = uint64(block.timestamp + 100);
        Squad s = _anchored(anchor);
        vm.warp(anchor + 250); // activation lands after the anchor
        _lockAll(s);
        // Next phase point is anchor + 300, but that is only 50s away (< half a round), so round 1 skips to anchor + 600.
        assertEq(s.roundDeadline(), anchor + 600);
    }

    function test_firstRoundAtLeastHalfARound() public {
        uint64 anchor = uint64(block.timestamp + 10);
        Squad s = _anchored(anchor);
        _lockAll(s);
        assertEq(s.roundDeadline(), anchor + 300); // 10s away is under half a round, so one whole round later
    }
}
