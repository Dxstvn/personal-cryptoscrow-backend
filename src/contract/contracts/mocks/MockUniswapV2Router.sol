// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapV2Router {
    address public immutable WETH;

    constructor(address _weth) {
        WETH = _weth;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");
        
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn; // 1:1 for testing
        
        IERC20(path[path.length - 1]).transfer(to, amounts[path.length - 1]);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");
        require(path[0] == WETH, "INVALID_PATH");
        
        amounts = new uint256[](path.length);
        amounts[0] = msg.value;
        amounts[path.length - 1] = msg.value * 1000; // Mock 1000:1 rate
        
        IERC20(path[path.length - 1]).transfer(to, amounts[path.length - 1]);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");
        require(path[path.length - 1] == WETH, "INVALID_PATH");
        
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn / 1000; // Mock 1000:1 rate
        
        payable(to).transfer(amounts[path.length - 1]);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        
        if (path[0] == WETH) {
            amounts[path.length - 1] = amountIn * 1000; // ETH to token
        } else if (path[path.length - 1] == WETH) {
            amounts[path.length - 1] = amountIn / 1000; // Token to ETH
        } else {
            amounts[path.length - 1] = amountIn; // Token to token
        }
    }

    receive() external payable {}
}