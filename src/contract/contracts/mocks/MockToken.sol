// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./MockERC20.sol";

// Alias for MockERC20 to match test expectations
contract MockToken is MockERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals_) 
        MockERC20(name, symbol, decimals_) {}
}