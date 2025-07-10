// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { IOFT, SendParam, MessagingFee, MessagingReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

/**
 * @title UniversalEscrowServiceV3Fixed
 * @notice Fixed version with proper WETH wrapping for ETH deposits
 * @dev Fixes the bug where contract tries to wrap ETH it doesn't have in msg.value
 */
contract UniversalEscrowServiceV3Fixed is UniversalEscrowServiceV3 {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;
    
    // Additional events for composer functionality
    event ComposerConfigured(uint32 indexed endpointId, address indexed composer);
    event CrossChainSwapInitiated(
        bytes32 indexed escrowId,
        address indexed targetToken,
        uint256 amount,
        uint256 minAmountOut
    );
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3(_serviceWallet, _weth, _uniswapRouter) {}
    
    /**
     * @notice Handle cross-chain transfer using LayerZero with composer support
     * @dev Uses source chain's OFT adapter and enhanced composer integration
     */
    function _handleCrossChainRelease(
        bytes32 escrowId, 
        EscrowDeposit memory escrow, 
        uint32 targetEndpointId
    ) internal override {
        // Get the current chain's endpoint ID and OFT adapter
        uint32 sourceEndpointId = chainIdToEndpointId[block.chainid];
        address oftAdapter = oftAdapters[sourceEndpointId];
        
        if (oftAdapter == address(0)) revert InvalidChainId();
        
        // Convert to WETH if needed for cross-chain transfer
        uint256 bridgeAmount = _prepareWETHForBridge(escrow);
        
        // Check if composer is available for automatic swaps
        address composer = swapComposers[targetEndpointId];
        bool useCompose = composer != address(0) && escrow.targetToken != address(WETH);
        
        // Prepare and execute cross-chain transfer
        _executeCrossChainTransfer(
            escrowId,
            escrow,
            oftAdapter,
            targetEndpointId,
            bridgeAmount,
            composer,
            useCompose
        );
    }
    
    /**
     * @notice Prepare WETH for bridging - FIXED VERSION
     * @dev Properly handles ETH that's already in the contract
     */
    function _prepareWETHForBridge(EscrowDeposit memory escrow) internal returns (uint256) {
        if (escrow.depositToken == address(0)) {
            // FIX: The ETH is already in the contract from the deposit
            // Check contract balance to ensure we have the ETH
            require(address(this).balance >= escrow.netAmount, "Insufficient ETH balance");
            
            // Wrap the ETH that's already in the contract
            IWETH(address(WETH)).deposit{value: escrow.netAmount}();
            return escrow.netAmount;
        } else if (escrow.depositToken != address(WETH)) {
            // Swap to WETH first using Uniswap
            address[] memory path = new address[](2);
            path[0] = escrow.depositToken;
            path[1] = address(WETH);
            
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                escrow.netAmount,
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        }
        return escrow.netAmount;
    }
    
    function _executeCrossChainTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        address oftAdapter,
        uint32 targetEndpointId,
        uint256 bridgeAmount,
        address composer,
        bool useCompose
    ) internal {
        bytes memory options;
        bytes memory composeMsg = "";
        
        if (useCompose) {
            // Calculate minimum amount out for target token swap
            uint256 minTargetAmount = escrow.targetToken == address(0) 
                ? bridgeAmount 
                : bridgeAmount * (MAX_BPS - maxSlippageBps * 2) / MAX_BPS;
            
            // Build compose message with swap instructions
            composeMsg = abi.encode(
                escrow.seller,          // recipient
                escrow.targetToken,     // target token (address(0) for ETH)
                bridgeAmount,           // amount of WETH to convert
                minTargetAmount,        // minimum amount out
                uint32(block.timestamp + 3600) // 1 hour deadline
            );
            
            // Build options with gas for both receive and compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(100000, 0)  // 100k gas for receive
                .addExecutorLzComposeOption(0, 300000, 0); // 300k gas for compose
                
            emit CrossChainSwapInitiated(escrowId, escrow.targetToken, bridgeAmount, minTargetAmount);
        } else {
            // Standard options without compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(lzReceiveGas, 0);
        }
        
        // Prepare LayerZero transfer
        bytes32 to = useCompose ? bytes32(uint256(uint160(composer))) : bytes32(uint256(uint160(escrow.seller)));
        
        SendParam memory sendParam = SendParam({
            dstEid: targetEndpointId,
            to: to,
            amountLD: bridgeAmount,
            minAmountLD: bridgeAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS,
            extraOptions: options,
            composeMsg: composeMsg,
            oftCmd: hex""
        });
        
        // Approve OFT adapter
        IERC20(address(WETH)).safeIncreaseAllowance(oftAdapter, bridgeAmount);
        
        // Get quote for LayerZero fee
        MessagingFee memory fee = IOFT(oftAdapter).quoteSend(sendParam, false);
        
        // Add buffer for compose execution
        uint256 requiredFee = useCompose ? fee.nativeFee * 150 / 100 : fee.nativeFee;
        require(msg.value >= requiredFee, "Insufficient fee for cross-chain transfer");
        
        // Execute cross-chain transfer
        (MessagingReceipt memory receipt, ) = IOFT(oftAdapter).send{value: requiredFee}(
            sendParam,
            MessagingFee(requiredFee, 0),
            payable(msg.sender) // Refund to original caller
        );
        
        emit CrossChainTransferInitiated(escrowId, escrow.targetChainId, oftAdapter, receipt.guid, useCompose);
        emit EscrowReleased(
            escrowId, 
            escrow.seller, 
            useCompose ? escrow.targetToken : address(WETH), 
            bridgeAmount, 
            useCompose ? "layerzero-compose" : "layerzero",
            useCompose
        );
    }
    
    /**
     * @notice Set swap composer for a chain with validation
     * @param endpointId The LayerZero endpoint ID
     * @param composer The composer contract address
     * @param chainName The name of the chain for logging
     */
    function setSwapComposerWithValidation(
        uint32 endpointId, 
        address composer,
        string memory chainName
    ) external onlyOwner {
        require(composer != address(0), "Invalid composer address");
        swapComposers[endpointId] = composer;
        chainNames[endpointId] = chainName;
        emit ComposerConfigured(endpointId, composer);
    }
    
    /**
     * @notice Estimate cross-chain transfer with composer
     * @param sourceChainId Source chain ID
     * @param targetChainId Target chain ID
     * @param amount Amount to transfer
     * @param targetToken Target token address
     * @return totalFee Estimated total fee including compose
     * @return estimatedOutput Estimated output amount after swaps
     */
    function estimateCrossChainTransfer(
        uint256 sourceChainId,
        uint256 targetChainId,
        uint256 amount,
        address targetToken
    ) external view returns (uint256 totalFee, uint256 estimatedOutput) {
        uint32 targetEndpointId = chainIdToEndpointId[targetChainId];
        address composer = swapComposers[targetEndpointId];
        
        // Base fee calculation (simplified for example)
        totalFee = 0.001 ether; // Base cross-chain fee
        
        if (composer != address(0) && targetToken != address(WETH)) {
            // Add composer execution fee
            totalFee += 0.0005 ether;
            
            // Estimate output with double slippage for safety
            estimatedOutput = amount * (MAX_BPS - maxSlippageBps * 2) / MAX_BPS;
        } else {
            // Direct WETH transfer
            estimatedOutput = amount;
        }
    }
}