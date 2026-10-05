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
        uint256 d0 = s.roundDeadline();
        vm.warp(block.timestamp + 10 days + 7); // not a whole number of rounds late
        s.settleRound(1);
        assertGt(uint256(s.roundDeadline()), block.timestamp);
        assertEq((uint256(s.roundDeadline()) - d0) % s.roundLength(), 0);
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
