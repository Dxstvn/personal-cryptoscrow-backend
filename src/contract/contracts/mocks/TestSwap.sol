// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "../interfaces/IUniswapV2Router.sol";

contract TestSwap {
    address public immutable WETH;
    IUniswapV2Router public immutable router;
    
    constructor(address _weth, address _router) {
        WETH = _weth;
        router = IUniswapV2Router(_router);
    }
    
    function testSwapETHForTokens(address toToken) external payable {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = toToken;
        
        router.swapExactETHForTokens{value: msg.value}(
            0, // accept any amount
            path,
            address(this),
            block.timestamp + 300
        );
    }
    
    receive() external payable {}
}