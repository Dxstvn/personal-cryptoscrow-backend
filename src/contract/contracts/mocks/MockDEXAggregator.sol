// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IDEXAggregator } from "../interfaces/IDEXAggregator.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title MockDEXAggregator
 * @notice Mock DEX aggregator for testing
 * @dev Simulates token swaps with configurable rates
 */
contract MockDEXAggregator is IDEXAggregator {
    using SafeERC20 for IERC20;
    
    // Mock exchange rates (in basis points, 10000 = 1:1)
    mapping(address => mapping(address => uint256)) public mockRates;
    
    // WETH address
    address public immutable WETH;
    
    // Mock slippage (in basis points)
    uint256 public mockSlippage = 50; // 0.5%
    
    constructor(address _weth) {
        WETH = _weth;
        
        // Set some default rates
        mockRates[address(0)][_weth] = 10000; // 1 ETH = 1 WETH
        mockRates[_weth][address(0)] = 10000; // 1 WETH = 1 ETH
    }
    
    /**
     * @notice Execute a token swap
     */
    function swap(
        SwapDescription calldata desc,
        bytes calldata /* data */
    ) external payable override returns (uint256 returnAmount) {
        // Calculate return amount based on mock rate
        uint256 rate = mockRates[desc.srcToken][desc.dstToken];
        require(rate > 0, "Pair not supported");
        
        returnAmount = (desc.amount * rate) / 10000;
        
        // Apply mock slippage
        returnAmount = (returnAmount * (10000 - mockSlippage)) / 10000;
        
        require(returnAmount >= desc.minReturnAmount, "Return amount too low");
        
        // Handle token transfers
        if (desc.srcToken == address(0)) {
            // ETH to token
            require(msg.value == desc.amount, "Incorrect ETH amount");
            
            if (desc.dstToken == WETH) {
                // Wrap ETH
                IWETH(WETH).deposit{value: desc.amount}();
                IERC20(WETH).safeTransfer(desc.dstReceiver, returnAmount);
            } else {
                // Mock swap - just transfer from this contract's balance
                IERC20(desc.dstToken).safeTransfer(desc.dstReceiver, returnAmount);
            }
        } else if (desc.dstToken == address(0)) {
            // Token to ETH
            IERC20(desc.srcToken).safeTransferFrom(msg.sender, address(this), desc.amount);
            
            if (desc.srcToken == WETH) {
                // Unwrap WETH
                IWETH(WETH).withdraw(returnAmount);
                (bool success, ) = desc.dstReceiver.call{value: returnAmount}("");
                require(success, "ETH transfer failed");
            } else {
                // Mock swap - just transfer ETH from this contract
                (bool success, ) = desc.dstReceiver.call{value: returnAmount}("");
                require(success, "ETH transfer failed");
            }
        } else {
            // Token to token
            IERC20(desc.srcToken).safeTransferFrom(msg.sender, address(this), desc.amount);
            IERC20(desc.dstToken).safeTransfer(desc.dstReceiver, returnAmount);
        }
        
        return returnAmount;
    }
    
    /**
     * @notice Get a quote for a token swap
     */
    function getQuote(
        address srcToken,
        address dstToken,
        uint256 amount
    ) external view override returns (
        uint256 rate,
        uint256 expectedReturn,
        uint256 gasEstimate
    ) {
        rate = mockRates[srcToken][dstToken];
        require(rate > 0, "Pair not supported");
        
        expectedReturn = (amount * rate) / 10000;
        gasEstimate = 150000; // Mock gas estimate
        
        return (rate, expectedReturn, gasEstimate);
    }
    
    /**
     * @notice Check if a token pair is supported
     */
    function isPairSupported(
        address srcToken,
        address dstToken
    ) external view override returns (bool) {
        return mockRates[srcToken][dstToken] > 0;
    }
    
    // Admin functions for testing
    
    /**
     * @notice Set mock exchange rate
     */
    function setMockRate(address srcToken, address dstToken, uint256 rate) external {
        mockRates[srcToken][dstToken] = rate;
    }
    
    /**
     * @notice Set mock slippage
     */
    function setMockSlippage(uint256 slippageBps) external {
        require(slippageBps < 10000, "Slippage too high");
        mockSlippage = slippageBps;
    }
    
    /**
     * @notice Fund the aggregator with tokens for testing
     */
    function fundToken(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
    
    // Receive ETH
    receive() external payable {}
}