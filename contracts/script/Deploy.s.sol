// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AjoNGN} from "../src/AjoNGN.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {SquadFactory} from "../src/SquadFactory.sol";

contract Deploy is Script {
    // Anvil's well-known account #0. Only ever used for chain 31337.
    uint256 constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        uint256 key = block.chainid == 31337 ? ANVIL_KEY : vm.envOr("DEPLOYER_KEY", uint256(0));
        require(key != 0, "DEPLOYER_KEY missing: copy contracts/.env.example to contracts/.env and fill it");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        AjoNGN token = new AjoNGN();
        TrustRegistry registry = new TrustRegistry(deployer);
        SquadFactory factory = new SquadFactory(token, registry);
        registry.setWriter(address(factory), true);
        vm.stopBroadcast();

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "token", address(token));
        vm.serializeAddress(obj, "registry", address(registry));
        vm.serializeAddress(obj, "factory", address(factory));
        string memory json = vm.serializeUint(obj, "deployBlock", block.number);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("token", address(token));
        console2.log("registry", address(registry));
        console2.log("factory", address(factory));
        console2.log("wrote", path);
    }
}
