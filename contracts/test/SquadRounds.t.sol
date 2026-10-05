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

    /// 4 members, c = C. Required deposits by turn: 3c, 2c, c, c (total 7c). Only t1 ever pays (round 1);
    /// t2, t3, t4 never do. Fronting demand outruns the jar's free money, so both the fronting cap
    /// (`f < amount - cov`) and the deposit-cover cap (`cov > h`) bind. Every settle must still succeed.
    /// Amounts in the comments are multiples of c. "headroom" = totalLocked - frontedTotal.
    function test_frontingCapBindsWhenDemandExceedsLiquidity() public {
        Squad s = _squad(4, C);
        _start(s);
        address[] memory t = new address[](4);
        uint256[4] memory b0;
        for (uint256 i; i < 4; i++) {
            t[i] = _turn(s, i + 1);
            b0[i] = token.balanceOf(t[i]);
        }
        _lockAll(s);
        assertEq(s.totalLocked(), 7 * C);

        // r1: t1 pays 1c. t2, t3, t4 miss for the first time: covered 1c each from their deposits
        // (2c -> 1c, 1c -> 0, 1c -> 0). payout = 1c + 3c = 4c, all to t1. totalLocked 7c - 3c = 4c.
        vm.prank(t[0]);
        s.contribute();
        _warpPastGrace(s);
        s.settleRound(1);
        assertEq(s.totalLocked(), 4 * C);
        assertEq(s.frontedTotal(), 0);

        // r2: nobody pays. t1 misses for the first time (already collected): deposit 3c -> 2c.
        // t2, t3, t4 miss again with a refill owed: all three stop (activeCount 4 -> 1).
        // t2: deposit 1c -> 0. t3: no deposit, fronts 1c (headroom 2c, then fronted 1c). t4: fronts 1c (headroom 1c).
        // payout = 4c. Collector t2 is stopped: withheld w = c * (n - r) = 2c goes back into t2's deposit,
        // so t2 receives 4c - 2c = 2c. totalLocked 4c - 2c + 2c = 4c, fronted 2c (t3 owes 1c, t4 owes 1c).
        _warpPastGrace(s);
        s.settleRound(2);
        assertTrue(s.stoppedPaying(t[1]));
        assertTrue(s.stoppedPaying(t[2]));
        assertTrue(s.stoppedPaying(t[3]));
        assertFalse(s.stoppedPaying(t[0]));
        assertEq(s.locked(t[1]), 2 * C);
        assertEq(s.owed(t[2]), C);
        assertEq(s.owed(t[3]), C);
        assertEq(s.frontedTotal(), 2 * C);
        assertEq(s.totalLocked(), 4 * C);

        // r3: nobody pays. t1 misses again with refill owed: stops; cpr = locked 2c / (n - r + 1 = 2) = c.
        // Demand: t1 cover 1c, t2 cover 1c (cap min(cpr = c, c)), t3 front 1c, t4 front 1c; headroom is 2c.
        // t1 cover takes 1c (headroom 2c -> 1c), t2 cover takes 1c (headroom 1c -> 0).
        // t3 front: headroom 0, so f = min(1c, 0) = 0 (capped, 1c short). t4 front: capped to 0 as well.
        // Without the cap t3 would owe 2c and t4 2c (fronted 4c > totalLocked 2c).
        // payout = 2c. Collector t3 owes 1c (from r2), repays it: gross 1c. t3 is stopped: w = c * (4 - 3) = 1c,
        // so t3 receives 0 and locked(t3) = 1c. fronted 2c - 1c = 1c (only t4's), totalLocked 2c + 1c = 3c.
        _warpPastGrace(s);
        vm.expectEmit(true, false, false, true);
        emit Squad.RoundSettled(3, t[2], 0, t); // the collector is paid nothing: the jar had nothing free
        s.settleRound(3);
        assertTrue(s.stoppedPaying(t[0]));
        assertEq(s.owed(t[2]), 0);
        assertEq(s.owed(t[3]), C);
        assertEq(s.locked(t[2]), C);
        assertEq(s.frontedTotal(), C);
        assertEq(s.totalLocked(), 3 * C);
        assertLe(s.frontedTotal(), s.totalLocked());

        // r4 (last): nobody pays; settle finishes the squad. t1 cover 1c (locked 1c -> 0, totalLocked 3c -> 2c),
        // t2 cover 1c (1c -> 0, 2c -> 1c). t3 (stopped past collector, last round cap c) holds 1c but headroom is
        // 1c - 1c fronted = 0: cover capped to 0. t4 front: headroom 0, capped to 0.
        // payout = 2c. Collector t4 repays its 1c owed: gets 2c - 1c = 1c.
        // Finish: all four stopped, nobody to refund, honest = 0. Jar = 7c deposits + 1c contribution
        // - payouts (4c + 2c + 0 + 1c) = 1c. That 1c is paid out as dust to members[n - 1] = t4.
        // Net per member: t1 -3c - 1c + 4c = 0; t2 -2c + 2c = 0; t3 -1c; t4 -1c + 1c + 1c = +1c.
        _warpPastGrace(s);
        vm.expectEmit(true, false, false, true);
        emit Squad.RoundSettled(4, t[3], C, t); // payout 2c less the 1c repaid; uncapped it would be 3c - 1c = 2c
        s.settleRound(4);
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(s.frontedTotal(), 0);
        assertEq(token.balanceOf(address(s)), 0);
        assertEq(token.balanceOf(t[0]), b0[0]);
        assertEq(token.balanceOf(t[1]), b0[1]);
        assertEq(token.balanceOf(t[2]), b0[2] - C);
        assertEq(token.balanceOf(t[3]), b0[3] + C);
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

    /// 5 members, c = C + 2 (so the pool does not divide evenly). Required deposits by turn: 4c, 3c, 2c, c, c.
    /// t1 collects in round 1, pays round 2, then misses rounds 3 and 4 (no refill): it stops in round 4 with
    /// leftover deposit that is forfeited at the end. t2..t5 never miss.
    function test_finishSplitsForfeitedDepositAmongZeroMissMembers() public {
        uint256 c = C + 2;
        Squad s = _squad(5, c);
        _start(s);
        address[5] memory t;
        uint256[5] memory b0;
        for (uint256 i; i < 5; i++) {
            t[i] = _turn(s, i + 1);
            b0[i] = token.balanceOf(t[i]);
        }
        _lockAll(s);
        assertEq(s.totalLocked(), 11 * c); // 4c + 3c + 2c + c + c

        _payAllExcept(s, address(0)); // r1: t1 collects 5c
        _payAllExcept(s, address(0)); // r2
        _payAllExcept(s, t[0]); // r3: t1 misses, covered 1c: locked 4c -> 3c
        _warpPastGrace(s);
        s.settleRound(3);
        _payAllExcept(s, t[0]); // r4: t1 misses again with refill owed -> stopped; cover 1c: 3c -> 2c
        _warpPastGrace(s);
        s.settleRound(4);
        assertTrue(s.stoppedPaying(t[0]));
        assertEq(s.locked(t[0]), 2 * c);
        _payAllExcept(s, address(0)); // r5: the 4 active members pay; t1 cover 1c (2c -> 1c); auto-settle, finish
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));

        // Every round paid out exactly 5c (contributions plus covers), so at finish the jar holds
        // deposits 11c + contributions (5 + 5 + 4 + 4 + 4 = 22c) - payouts 5 * 5c = 8c.
        // sumKept = t2..t5 deposits = 3c + 2c + c + c = 7c. t1's remaining 1c is forfeited.
        // pool = 8c - 7c = c = 1000e18 + 2. honest = 4 (t2..t5 have no misses), so
        // share = floor(c / 4) = 250e18 (the 2 wei remainder is not divisible by 4).
        // Dust = pool - 4 * share = 2 wei, paid to the last still-paying member in turn order: t5.
        // Each of t2..t5 paid 5c of contributions and collected 5c in its own turn, and got its deposit back,
        // so its net change is its share. t1: paid 2c, collected 5c, locked 4c, got nothing back: net -1c.
        assertEq(token.balanceOf(t[1]), b0[1] + 250e18);
        assertEq(token.balanceOf(t[2]), b0[2] + 250e18);
        assertEq(token.balanceOf(t[3]), b0[3] + 250e18);
        assertEq(token.balanceOf(t[4]), b0[4] + 250e18 + 2);
        assertEq(token.balanceOf(t[0]), b0[0] - c);
        assertEq(s.locked(t[0]), 0);
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
