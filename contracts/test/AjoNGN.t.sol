// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AjoNGN} from "../src/AjoNGN.sol";

contract AjoNGNTest is Test {
    AjoNGN token;

    function setUp() public {
        token = new AjoNGN();
    }

    function test_metadata() public view {
        assertEq(token.name(), "Squadjar Naira");
        assertEq(token.symbol(), "sNGN");
        assertEq(token.decimals(), 18);
    }

    function test_faucetMintsToCaller() public {
        address u = makeAddr("u");
        vm.prank(u);
        token.faucet(50_000e18);
        assertEq(token.balanceOf(u), 50_000e18);
    }

    function test_faucetAllowsExactCap() public {
        token.faucet(200_000e18);
        assertEq(token.balanceOf(address(this)), 200_000e18);
    }

    function test_faucetRevertsAboveCap() public {
        vm.expectRevert(AjoNGN.FaucetCapExceeded.selector);
        token.faucet(200_000e18 + 1);
    }

    function test_permitSetsAllowance() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        address spender = makeAddr("spender");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner, spender, type(uint256).max, token.nonces(owner), deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        token.permit(owner, spender, type(uint256).max, deadline, v, r, s);
        assertEq(token.allowance(owner, spender), type(uint256).max);
    }
}
