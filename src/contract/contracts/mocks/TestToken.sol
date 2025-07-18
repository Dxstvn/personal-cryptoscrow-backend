// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test Token", "TEST") {
        _mint(msg.sender, 1000000 * 10**18); // Mint 1 million tokens to deployer
    }
    
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}