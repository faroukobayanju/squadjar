// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITrust {
    function trustScore(address user) external view returns (int256);
    function tier(address user) external view returns (uint8);
    function recordContribution(address member, bool late) external;
    function recordMiss(address member) external;
    function recordCompleted(address member) external;
}

interface IMembership {
    function noteMembership(address member, bool joined) external;
}
