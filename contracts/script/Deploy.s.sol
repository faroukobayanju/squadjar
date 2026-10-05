// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract Deploy is Script {
    // Anvil's well-known account #0. Only ever used for chain 31337.
    uint256 constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    /// Other chains sign with a Foundry keystore, never a raw key:
    /// forge script script/Deploy.s.sol --rpc-url monad_testnet --account <keystore> --sender <address> --broadcast
    ///
    /// Set TOKEN=<address> to keep an already-deployed sNGN token and replace only
    /// the trust registry and squad factory.
    function run() external {
        address existing = vm.envOr("TOKEN", address(0));
        if (existing != address(0)) {
            require(existing.code.length > 0, "TOKEN has no code on this chain");
        }

        address deployer;
        if (block.chainid == 31337) {
            deployer = vm.addr(ANVIL_KEY);
            vm.startBroadcast(ANVIL_KEY);
        } else {
            deployer = msg.sender;
            require(deployer != DEFAULT_SENDER, "Pass --account <keystore> --sender <address>");
            vm.startBroadcast();
        }
        AjoNGN token = existing == address(0) ? new AjoNGN() : AjoNGN(existing);
        TrustRegistry registry = new TrustRegistry(deployer);
        SquadFactory factory = new SquadFactory(token, registry);
        registry.setWriter(address(factory), true);
        vm.stopBroadcast();

        vm.createDir("deployments", true);
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "token", address(token));
        vm.serializeAddress(obj, "registry", address(registry));
        vm.serializeAddress(obj, "factory", address(factory));
        // block at simulation time: a safe lower bound for event scans, not the exact deploy block
        string memory json = vm.serializeUint(obj, "deployBlock", block.number);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log(existing == address(0) ? "token" : "reused token", address(token));
        console2.log("registry", address(registry));
        console2.log("factory", address(factory));
        console2.log("wrote", path);
    }
}
