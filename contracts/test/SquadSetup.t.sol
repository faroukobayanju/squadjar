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
}
