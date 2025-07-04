// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IDEXAggregator
 * @notice Interface for DEX aggregator contracts (1inch, 0x, etc.)
 */
interface IDEXAggregator {
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address srcReceiver;
        address dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
    }
    
    /**
     * @notice Execute a token swap
     * @param desc Swap description with all parameters
     * @param data Additional swap data (route specific)
     * @return returnAmount Amount of destination tokens received
     */
    function swap(
        SwapDescription calldata desc,
        bytes calldata data
    ) external payable returns (uint256 returnAmount);
    
    /**
     * @notice Get a quote for a token swap
     * @param srcToken Source token address
     * @param dstToken Destination token address
     * @param amount Amount to swap
     * @return rate Exchange rate
     * @return expectedReturn Expected amount to receive
     * @return gasEstimate Estimated gas cost
     */
    function getQuote(
        address srcToken,
        address dstToken,
        uint256 amount
    ) external view returns (
        uint256 rate,
        uint256 expectedReturn,
        uint256 gasEstimate
    );
    
    /**
     * @notice Check if a token pair is supported
     * @param srcToken Source token address
     * @param dstToken Destination token address
     * @return supported Whether the pair is supported
     */
    function isPairSupported(
        address srcToken,
        address dstToken
    ) external view returns (bool supported);
}