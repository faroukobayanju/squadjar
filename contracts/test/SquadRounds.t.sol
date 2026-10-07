// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Squad} from "../src/Squad.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract SquadRoundsTest is Base {
    function _active(uint256 n, uint256 c) internal returns (Squad s) {
        s = _squad(n, c);
        _start(s);
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
        assertEq(token.balanceOf(t1), before); // paid c, payout 3c with 2c held: received c
        assertEq(s.locked(t1), 2 * C);
    }

    function test_payoutHeldEmitted() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        vm.prank(_turn(s, 2));
        s.contribute();
        vm.prank(_turn(s, 3));
        s.contribute();
        vm.expectEmit(true, false, false, true);
        emit Squad.PayoutHeld(t1, 1, 2 * C);
        vm.prank(t1);
        s.contribute();
    }

    /// 5 members, c = C, everyone pays round 1. Turn 1 still owes 4c after collecting.
    function test_newCollectorHoldsAllRemaining() public {
        Squad s = _active(5, C);
        address t1 = _turn(s, 1);
        uint256 before = token.balanceOf(t1);
        _payAllExcept(s, address(0));
        assertEq(s.locked(t1), 4 * C);
        assertEq(s.totalLocked(), 4 * C);
        assertEq(token.balanceOf(t1), before); // paid c, received 5c - 4c = c
    }

    function test_buildingCollectorHolds75Percent() public {
        _setScore(users[1], 5);
        Squad s = _active(5, C);
        address t1 = _turn(s, 1);
        assertEq(t1, users[1]);
        uint256 before = token.balanceOf(t1);
        _payAllExcept(s, address(0));
        assertEq(s.locked(t1), 3 * C); // 4c * 75%
        assertEq(token.balanceOf(t1) - before, C); // paid c, received 2c
    }

    function test_reliableCollectorHolds50Percent() public {
        _setScore(users[1], 20);
        Squad s = _active(5, C);
        address t1 = _turn(s, 1);
        assertEq(t1, users[1]);
        uint256 before = token.balanceOf(t1);
        _payAllExcept(s, address(0));
        assertEq(s.locked(t1), 2 * C); // 4c * 50%
        assertEq(token.balanceOf(t1) - before, 2 * C); // paid c, received 3c
    }

    function test_lastTurnHoldsNothing() public {
        Squad s = _active(5, C);
        address t5 = _turn(s, 5);
        for (uint256 r = 1; r <= 4; r++) _payAllExcept(s, address(0));
        uint256 before = token.balanceOf(t5);
        _payAllExcept(s, address(0)); // round 5: t5 collects the full 5c
        assertEq(token.balanceOf(t5) - before, 4 * C); // paid c, received 5c, nothing held
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
    }

    function test_heldRefundedAtFinishZeroSum() public {
        uint256[5] memory before;
        for (uint256 i; i < 5; i++) before[i] = token.balanceOf(users[i]);
        Squad s = _active(5, C);
        for (uint256 r = 1; r <= 5; r++) _payAllExcept(s, address(0));
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        for (uint256 i; i < 5; i++) {
            assertEq(token.balanceOf(users[i]), before[i]);
            assertEq(s.locked(users[i]), 0);
        }
        assertEq(s.totalLocked(), 0);
        assertEq(token.balanceOf(address(s)), 0);
    }

    /// 3 members. Round 1 all pay, so t1 holds 2c. t1 misses round 2: its held money covers it.
    function test_heldMoneyCoversOwnMissFullPayout() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t2 = _turn(s, 2);
        _payAllExcept(s, address(0));
        uint256 before = token.balanceOf(t2);
        _missRound(s, t1);
        assertEq(token.balanceOf(t2) - before, C); // paid c, payout 3c with c held: received 2c
        assertEq(s.locked(t1), C);
        assertEq(s.locked(t2), C);
        assertEq(s.owed(t1), 0);
        assertEq(s.credit(t2), 0);
    }

    /// 3 members. t3 misses round 1 and has nothing held, so t1 is paid short and t3 owes it c.
    function test_roundOneMissRecordsDebtAndCredit() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t3 = _turn(s, 3);
        uint256 before = token.balanceOf(t1);
        _missRound(s, t3);
        assertEq(s.owed(t3), C);
        assertEq(s.credit(t1), C);
        assertEq(s.locked(t1), 2 * C); // pool 2c, all of it held
        assertEq(before - token.balanceOf(t1), C); // paid c, received 0
    }

    function test_payBackSendsMoneyToShortCollector() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t3 = _turn(s, 3);
        _missRound(s, t3);
        uint256 before = token.balanceOf(t1);
        vm.expectEmit(true, false, false, true);
        emit Squad.CreditPaid(t1, C);
        vm.expectEmit(true, false, false, true);
        emit Squad.PaidBack(t3, C);
        vm.prank(t3);
        s.payBack();
        assertEq(token.balanceOf(t1) - before, C);
        assertEq(s.owed(t3), 0);
        assertEq(s.credit(t1), 0);
    }

    /// t3 misses round 1, pays rounds 2 and 3. Its round 3 payout repays t1 first.
    function test_debtRepaidFromMissersOwnPayout() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t3 = _turn(s, 3);
        _missRound(s, t3);
        _payAllExcept(s, address(0)); // round 2
        _payAllExcept(s, t3); // round 3: t1 and t2 pay
        vm.expectEmit(true, false, false, true);
        emit Squad.CreditPaid(t1, C);
        vm.expectEmit(true, true, false, true);
        emit Squad.RoundSettled(3, t3, 2 * C, new address[](0)); // 3c less the c repaid, nothing held
        vm.prank(t3);
        s.contribute();
        assertEq(s.owed(t3), 0);
        assertEq(s.credit(t1), 0);
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_collectorMissingOwnRoundRecordsNoDebt() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        _missRound(s, t1);
        assertEq(s.owed(t1), 0);
        assertEq(s.credit(t1), 0);
        assertEq(s.missCount(t1), 1);
        assertEq(s.locked(t1), 2 * C);
    }

    /// Reliable t1 holds 2c * 50% = c in round 1, misses rounds 2 and 3: round 2 is covered, round 3 is debt to t3.
    function test_payBackAfterCompleted() public {
        _setScore(users[1], 20);
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t3 = _turn(s, 3);
        assertEq(t1, users[1]);
        _payAllExcept(s, address(0));
        assertEq(s.locked(t1), C);
        _missRound(s, t1);
        assertEq(s.locked(t1), 0);
        _missRound(s, t1);
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(s.owed(t1), C);
        assertEq(s.credit(t3), C);
        uint256 before = token.balanceOf(t3);
        vm.prank(t1);
        s.payBack();
        assertEq(token.balanceOf(t3) - before, C);
        assertEq(s.owed(t1), 0);
        assertEq(s.credit(t3), 0);
        assertEq(token.balanceOf(address(s)), 0);
    }

    function test_payBackReverts() public {
        Squad s = _squad(3, C);
        vm.prank(users[1]);
        vm.expectRevert(abi.encodeWithSelector(Squad.WrongState.selector, Squad.State.Open));
        s.payBack();
        _start(s);
        vm.prank(users[1]);
        vm.expectRevert(Squad.NothingOwed.selector);
        s.payBack();
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(Squad.NotMember.selector);
        s.payBack();
    }

    function test_payBackWithoutAllowanceRevertsAndKeepsDebt() public {
        Squad s = _active(3, C);
        address t1 = _turn(s, 1);
        address t3 = _turn(s, 3);
        _missRound(s, t3);
        vm.startPrank(t3);
        token.approve(address(s), 0);
        vm.expectRevert();
        s.payBack();
        vm.stopPrank();
        assertEq(s.owed(t3), C);
        assertEq(s.credit(t1), C);
    }

    function test_settleWithEveryoneMissingAdvances() public {
        Squad s = _active(3, C);
        _warpPastGrace(s);
        s.settleRound(1);
        assertEq(s.currentRound(), 2);
        assertEq(s.owed(_turn(s, 1)), 0);
        assertEq(s.owed(_turn(s, 2)), C);
        assertEq(s.owed(_turn(s, 3)), C);
        assertEq(s.credit(_turn(s, 1)), 2 * C);
        assertEq(token.balanceOf(address(s)), 0);
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
        for (uint256 r; r < 5; r++) _payAllExcept(big, address(0));
        (,,, uint32 doneBig) = registry.records(users[1]);
        assertEq(doneBig, 1);
    }

    /// Weekly, 5 members, c = C (counts for trust). t1 collects round 1, misses rounds 2 and 3 (covered from
    /// its held money), then pays rounds 4 and 5. t2..t5 pay all five rounds on time.
    /// t1: onTime 3, missed 2, completed 0 (it has misses). t2: onTime 5, missed 0, completed 1.
    function test_trustWritesInTrustCountingSquad() public {
        Squad s = _squadWith(5, C, SquadFactory.Period.Weekly);
        _start(s);
        assertTrue(s.countsForTrust());
        address t1 = _turn(s, 1);
        address t2 = _turn(s, 2);

        _payAllExcept(s, address(0)); // r1: everyone on time, t1 collects
        _missRound(s, t1); // r2
        _missRound(s, t1); // r3
        assertEq(s.missCount(t1), 2);
        _payAllExcept(s, address(0)); // r4
        _payAllExcept(s, address(0)); // r5: finish
        assertEq(uint8(s.state()), uint8(Squad.State.Completed));

        (uint32 on, uint32 late, uint32 missed, uint32 done) = registry.records(t1);
        assertEq(on, 3);
        assertEq(late, 0);
        assertEq(missed, 2);
        assertEq(done, 0);
        (on, late, missed, done) = registry.records(t2);
        assertEq(on, 5);
        assertEq(late, 0);
        assertEq(missed, 0);
        assertEq(done, 1);
    }

    /// Demo: roundLength 300, grace 60. Round 1's deadline is D. Settling at D + 100 leaves a 200s lead to
    /// D + 300 (>= 150), which stays. Settling at D + 200 would leave only 100s, so round 2 is pushed one
    /// more round to D + 600 (400s of room) and the phase stays aligned to the original schedule.
    function test_lateSettleKeepsHalfRoundToPay() public {
        Squad ok = _active(3, C);
        Squad late = _active(3, C); // same start time, same deadline
        uint256 d = ok.roundDeadline();
        assertEq(uint256(late.roundDeadline()), d);

        vm.warp(d + 100);
        ok.settleRound(1);
        assertEq(uint256(ok.roundDeadline()), d + 300); // 200s lead: unchanged

        vm.warp(d + 200);
        late.settleRound(1);
        assertEq(uint8(late.state()), uint8(Squad.State.Active));
        assertEq(late.currentRound(), 2);
        assertEq(uint256(late.roundDeadline()), d + 600); // bumped one more round
        assertEq((uint256(late.roundDeadline()) - d) % late.roundLength(), 0); // phase kept
        assertGe(uint256(late.roundDeadline()) - block.timestamp, late.roundLength() / 2);
    }

    /// Weekly, 5 members, c = C (counts for trust). The factory is revoked after round 1. Round 2's miss
    /// must not revert, so the squad finishes with an empty jar. Only the round 1 on-time write is in the
    /// registry; every write after the revoke is ignored.
    function test_trustSquadFinishesAfterFactoryRevoked() public {
        Squad s = _squadWith(5, C, SquadFactory.Period.Weekly);
        _start(s);
        assertTrue(s.countsForTrust());

        _payAllExcept(s, address(0)); // r1: counted while the factory is allowed
        registry.setWriter(address(factory), false);
        _missRound(s, _turn(s, 3)); // r2: turn 3 misses; the ignored trust write must not revert
        assertEq(s.missCount(_turn(s, 3)), 1);
        for (uint256 r = 3; r <= 5; r++) _payAllExcept(s, address(0));

        assertEq(uint8(s.state()), uint8(Squad.State.Completed));
        assertEq(token.balanceOf(address(s)), 0);
        for (uint256 i; i < 5; i++) {
            (uint32 on, uint32 late, uint32 missed, uint32 done) = registry.records(s.memberAt(i));
            assertEq(on, 1);
            assertEq(late, 0);
            assertEq(missed, 0);
            assertEq(done, 0);
        }
    }

    /// Weekly, 5 members: 999e18 is just under the 1000e18 floor and does not count for trust; exactly 1000e18 does.
    function test_trustGateNeedsContributionOf1000() public {
        Squad below = _squadWith(5, 999e18, SquadFactory.Period.Weekly);
        _start(below);
        assertFalse(below.countsForTrust());

        Squad exact = _squadWith(5, 1000e18, SquadFactory.Period.Weekly);
        _start(exact);
        assertTrue(exact.countsForTrust());
    }

    function test_trustGateNeedsFiveMembers() public {
        Squad s = _squadWith(4, C, SquadFactory.Period.Weekly);
        _start(s);
        assertFalse(s.countsForTrust());
    }

    function test_getStateReturnsArrays() public {
        _setScore(users[1], 20);
        Squad s = _active(3, C);
        _payAllExcept(s, address(0)); // round 1: Reliable t1 holds 2c * 50% = c
        Squad.SquadView memory v = s.getState();
        assertEq(uint8(v.state), uint8(Squad.State.Active));
        assertEq(v.members.length, 3);
        assertEq(v.members[0], users[1]);
        assertEq(v.allowance[0], 50);
        assertEq(v.allowance[1], 0);
        assertEq(v.locked[0], C);
        assertEq(v.credit.length, 3);
        assertEq(v.owed.length, 3);
        assertEq(v.totalLocked, C);
        assertEq(v.currentRound, 2);
    }
}
