// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ITrust} from "./ITrust.sol";

/// Portable trust history. Survives factory redeploys: the owner allowlists factories,
/// factories register the squads they create, and only live squads write. A write from any
/// other address (including a squad of a revoked factory) is ignored, never reverted, so
/// revoking a factory cannot freeze a squad's money.
contract TrustRegistry is ITrust, Ownable2Step {
    uint8 public constant NEW = 0;
    uint8 public constant BUILDING = 1;
    uint8 public constant RELIABLE = 2;

    struct Record {
        uint32 onTime;
        uint32 late;
        uint32 missed;
        uint32 completed;
    }

    mapping(address => bool) public isWriter;
    mapping(address => address) public factoryOf; // squad => factory that registered it
    mapping(address => Record) public records;

    event WriterSet(address indexed factory, bool allowed);
    event SquadRegistered(address indexed factory, address indexed squad);

    error NotWriter();
    error ZeroFactory();
    error NotSquad(); // no longer thrown; kept so the app's ABI stays compatible

    /// Ownable2Step: the owner key can be rotated (transferOwnership + acceptOwnership).
    constructor(address _owner) Ownable(_owner) {}

    function setWriter(address factory, bool allowed) external onlyOwner {
        if (factory == address(0)) revert ZeroFactory();
        isWriter[factory] = allowed;
        emit WriterSet(factory, allowed);
    }

    function registerSquad(address squad) external {
        if (!isWriter[msg.sender]) revert NotWriter();
        factoryOf[squad] = msg.sender;
        emit SquadRegistered(msg.sender, squad);
    }

    /// A squad is live only while its factory is still allowlisted. Writes from addresses that
    /// are not live squads are ignored, so revoking a factory stops its squads' trust writes
    /// without freezing their money.
    function isSquad(address squad) public view returns (bool) {
        return isWriter[factoryOf[squad]];
    }

    function trustScore(address user) public view returns (int256) {
        Record memory r = records[user];
        return int256(uint256(r.onTime)) - 2 * int256(uint256(r.late)) - 10 * int256(uint256(r.missed))
            + 3 * int256(uint256(r.completed));
    }

    function tier(address user) external view returns (uint8) {
        int256 s = trustScore(user);
        if (s >= 20) return RELIABLE;
        if (s >= 5) return BUILDING;
        return NEW;
    }

    function recordContribution(address member, bool late) external {
        if (!isSquad(msg.sender)) return;
        if (late) records[member].late++;
        else records[member].onTime++;
    }

    function recordMiss(address member) external {
        if (!isSquad(msg.sender)) return;
        records[member].missed++;
    }

    function recordCompleted(address member) external {
        if (!isSquad(msg.sender)) return;
        records[member].completed++;
    }
}
