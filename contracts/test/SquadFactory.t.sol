// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SquadFactory} from "../src/SquadFactory.sol";
import {Squad} from "../src/Squad.sol";

contract SquadFactoryTest is Base {
    event Membership(address indexed member, address indexed squad, bool joined);

    function test_createSquadRegistersAndSetsOrganizer() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Weekly, INVITE, 0);
        assertTrue(factory.isSquad(s));
        assertEq(Squad(s).organizer(), users[0]);
        assertEq(Squad(s).memberCount(), 1);
        assertEq(Squad(s).inviteHash(), INVITE);
        assertEq(Squad(s).roundLength(), 604800);
        assertEq(Squad(s).grace(), 43200);
        assertEq(Squad(s).depositWindow(), 172800);
    }

    function test_createEmitsOrganizerMembership() public {
        vm.expectEmit(true, false, false, true, address(factory));
        emit Membership(users[0], address(0), true);
        vm.prank(users[0]);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsSmallContribution() public {
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.ContributionTooLow.selector, 100e18));
        factory.createSquad(100e18 - 1, 5, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsSizeOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));
        factory.createSquad(C, 2, SquadFactory.Period.Demo, INVITE, 0);
        vm.expectRevert(abi.encodeWithSelector(SquadFactory.SizeOutOfRange.selector, uint8(3), uint8(20)));
        factory.createSquad(C, 21, SquadFactory.Period.Demo, INVITE, 0);
    }

    function test_createSquadRejectsEmptyInvite() public {
        vm.expectRevert(SquadFactory.EmptyInvite.selector);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, bytes32(0), 0);
    }

    function test_createSquadRejectsPastDeadline() public {
        vm.warp(1000);
        vm.expectRevert(SquadFactory.DeadlineInPast.selector);
        factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 1000);
    }

    function test_timingPresets() public view {
        (uint32 rl, uint32 g, uint32 dw) = factory.timing(SquadFactory.Period.Demo);
        assertEq(rl, 300); assertEq(g, 60); assertEq(dw, 300);
        (rl, g, dw) = factory.timing(SquadFactory.Period.Monthly);
        assertEq(rl, 2592000); assertEq(g, 172800); assertEq(dw, 259200);
    }

    function test_noteMembershipOnlyFromSquads() public {
        vm.expectRevert(SquadFactory.NotSquad.selector);
        factory.noteMembership(users[1], true);
    }
}
