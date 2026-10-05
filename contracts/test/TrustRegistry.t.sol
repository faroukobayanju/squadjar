// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract TrustRegistryTest is Base {
    function test_onlyOwnerSetsWriters() public {
        vm.prank(users[1]);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", users[1]));
        registry.setWriter(users[1], true);
    }

    function test_setWriterRejectsZeroAddress() public {
        vm.expectRevert(TrustRegistry.ZeroFactory.selector);
        registry.setWriter(address(0), true);
    }

    function test_ownershipTransfersInTwoSteps() public {
        registry.transferOwnership(users[1]);
        assertEq(registry.owner(), address(this));
        vm.prank(users[1]);
        registry.acceptOwnership();
        assertEq(registry.owner(), users[1]);
    }

    function test_onlyWritersRegisterSquads() public {
        vm.prank(users[1]);
        vm.expectRevert(TrustRegistry.NotWriter.selector);
        registry.registerSquad(users[1]);
    }

    function test_recordsFromNonSquadsAreIgnored() public {
        registry.recordMiss(users[1]);
        registry.recordContribution(users[1], false);
        registry.recordCompleted(users[1]);
        (uint32 on, uint32 late, uint32 missed, uint32 done) = registry.records(users[1]);
        assertEq(on + late + missed + done, 0);
    }

    function test_factoryRegistersItsSquads() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        assertTrue(registry.isSquad(s));
    }

    function test_revokedFactorySquadWritesAreIgnored() public {
        vm.prank(users[0]);
        address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        registry.setWriter(address(factory), false);
        vm.prank(s);
        registry.recordMiss(users[1]);
        (,, uint32 missed,) = registry.records(users[1]);
        assertEq(missed, 0);
        registry.setWriter(address(factory), true); // re-allowed: writes count again
        vm.prank(s);
        registry.recordMiss(users[1]);
        (,, missed,) = registry.records(users[1]);
        assertEq(missed, 1);
    }

    function test_historySurvivesNewFactory() public {
        _makeReliable(users[2]);
        SquadFactory factory2 = new SquadFactory(token, registry);
        registry.setWriter(address(factory2), true);
        registry.setWriter(address(factory), false);
        assertEq(registry.trustScore(users[2]), 20);
        vm.prank(users[0]);
        address s = factory2.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
        assertTrue(registry.isSquad(s));
    }

    function test_trustScoreMathAndTiers() public {
        vm.prank(users[7]);
        address s = factory.createSquad(C, 3, SquadFactory.Period.Demo, INVITE, 0);
        address u = users[1];
        assertEq(registry.tier(u), 0);
        vm.startPrank(s);
        for (uint256 i; i < 6; i++) registry.recordContribution(u, false); // +6
        assertEq(registry.trustScore(u), 6);
        assertEq(registry.tier(u), 1);
        registry.recordContribution(u, true); // -2
        registry.recordCompleted(u);          // +3
        assertEq(registry.trustScore(u), 7);
        registry.recordMiss(u);               // -10
        assertEq(registry.trustScore(u), -3);
        assertEq(registry.tier(u), 0);
        vm.stopPrank();
    }
}
