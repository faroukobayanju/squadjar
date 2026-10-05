// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// Test naira for Monad testnet. Shown in the app as ₦.
/// Permit lets the app approve a squad with a signature instead of a separate transaction.
contract AjoNGN is ERC20, ERC20Permit {
    uint256 public constant FAUCET_MAX = 200_000e18;

    error FaucetCapExceeded();

    constructor() ERC20("Squadjar Naira", "sNGN") ERC20Permit("Squadjar Naira") {}

    function faucet(uint256 amount) external {
        if (amount > FAUCET_MAX) revert FaucetCapExceeded();
        _mint(msg.sender, amount);
    }
}
