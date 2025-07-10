// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IStargateRouter
 * @notice Interface for Stargate Router
 */
interface IStargateRouter {
    struct lzTxObj {
        uint256 dstGasForCall;
        uint256 dstNativeAmount;
        bytes dstNativeAddr;
    }
    
    function swap(
        uint16 _dstChainId,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        address payable _refundAddress,
        uint256 _amountLD,
        uint256 _minAmountLD,
        lzTxObj memory _lzTxParams,
        bytes calldata _to,
        bytes calldata _payload
    ) external payable;
    
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        uint8 _functionType,
        bytes calldata _toAddress,
        bytes calldata _transferAndCallPayload,
        lzTxObj memory _lzTxParams
    ) external view returns (uint256, uint256);
}

/**
 * @title IStargateRouterETH
 * @notice Interface for Stargate Router ETH
 */
interface IStargateRouterETH {
    function swapETH(
        uint16 _dstChainId,
        address payable _refundAddress,
        bytes calldata _toAddress,
        uint256 _amountLD,
        uint256 _minAmountLD
    ) external payable;
    
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        bytes calldata _toAddress,
        IStargateRouter.lzTxObj memory _lzTxParams
    ) external view returns (uint256, uint256);
}

/**
 * @title UniversalEscrowServiceV3Stargate
 * @notice Enhanced escrow service with Stargate integration for cross-chain transfers
 * @dev Combines same-chain functionality with Stargate for cross-chain native asset bridging
 */
contract UniversalEscrowServiceV3Stargate is UniversalEscrowServiceV3 {
    using SafeERC20 for IERC20;
    
    // Stargate configuration
    mapping(uint256 => address) public stargateRouters;     // chainId => Router address
    mapping(uint256 => address) public stargateRouterETHs; // chainId => RouterETH address
    mapping(uint256 => uint16) public chainIdToStargateId; // chainId => Stargate chain ID
    mapping(address => uint256) public tokenToPoolId;      // token => Stargate pool ID
    
    // Cross-chain routing mode
    enum CrossChainMode {
        DISABLED,
        LAYERZERO_OFT,
        STARGATE
    }
    
    mapping(uint256 => CrossChainMode) public crossChainModes;
    
    // Events
    event StargateRouterSet(uint256 indexed chainId, address router, address routerETH);
    event StargateTransferInitiated(bytes32 indexed escrowId, uint16 dstChainId, uint256 amount);
    event CrossChainModeSet(uint256 indexed chainId, CrossChainMode mode);
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3(_serviceWallet, _weth, _uniswapRouter) {
        _initializeStargateConfig();
    }
    
    /**
     * @notice Enhanced release function with intelligent routing
     * @dev Automatically chooses best cross-chain method based on configuration
     */
    function releaseEscrow(bytes32 escrowId) external payable override nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        require(escrow.buyer != address(0), "Escrow not found");
        require(escrow.conditionMet, "Condition not met");
        require(!escrow.released, "Escrow already released");
        
        escrow.released = true;
        
        // Same-chain release (existing functionality)
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            // Cross-chain release with intelligent routing
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle same-chain release (preserves existing functionality)
     */
    function _handleSameChainRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        // Same-chain, same-token: Direct transfer
        if (escrow.depositToken == escrow.targetToken) {
            if (escrow.depositToken == address(0)) {
                payable(escrow.seller).transfer(escrow.netAmount);
            } else {
                IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
            }
            emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, escrow.netAmount, "direct", false);
        } 
        // Same-chain, different-token: Uniswap swap
        else {
            // This version only supports swapping to ETH for cross-chain
            require(escrow.targetToken == address(0), "Only ETH target supported for swaps");
            
            uint256 outputAmount = _swapTokenToETH(escrow.depositToken, escrow.netAmount);
            payable(escrow.seller).transfer(outputAmount);
            
            emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, outputAmount, "uniswap-swap", false);
        }
    }
    
    /**
     * @notice Enhanced cross-chain release with intelligent routing
     */
    function _handleCrossChainReleaseEnhanced(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        CrossChainMode mode = crossChainModes[escrow.targetChainId];
        
        if (mode == CrossChainMode.STARGATE) {
            _handleStargateRelease(escrowId, escrow);
        } else if (mode == CrossChainMode.LAYERZERO_OFT) {
            // Fall back to existing LayerZero OFT implementation
            uint32 targetEndpointId = chainIdToEndpointId[escrow.targetChainId];
            _handleCrossChainRelease(escrowId, escrow, targetEndpointId);
        } else {
            revert("Cross-chain mode not configured");
        }
    }
    
    /**
     * @notice Handle cross-chain release via Stargate
     */
    function _handleStargateRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint16 stargateChainId = chainIdToStargateId[escrow.targetChainId];
        require(stargateChainId != 0, "Stargate not configured for target chain");
        
        // For ETH/WETH transfers, use RouterETH
        if (escrow.depositToken == address(0) || escrow.depositToken == address(WETH)) {
            _handleETHStargateTransfer(escrowId, escrow, stargateChainId);
        } else {
            // For other tokens, convert to ETH/WETH first then use RouterETH
            _handleTokenStargateTransfer(escrowId, escrow, stargateChainId);
        }
    }
    
    /**
     * @notice Handle ETH/WETH transfer via Stargate RouterETH
     */
    function _handleETHStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId
    ) internal {
        address routerETH = stargateRouterETHs[block.chainid];
        require(routerETH != address(0), "RouterETH not configured");
        
        uint256 ethAmount = escrow.netAmount;
        
        // Convert WETH to ETH if needed
        if (escrow.depositToken == address(WETH)) {
            IWETH(address(WETH)).withdraw(ethAmount);
        }
        
        // Quote the LayerZero fee
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        (uint256 fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
            stargateChainId,
            toAddress,
            lzTxParams
        );
        
        // Ensure sufficient fee is provided
        require(msg.value >= fee, "Insufficient fee for Stargate transfer");
        
        // Calculate minimum amount with slippage
        uint256 minAmount = ethAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        // Execute Stargate ETH transfer
        IStargateRouterETH(routerETH).swapETH{value: ethAmount + fee}(
            stargateChainId,
            payable(msg.sender), // refund address
            toAddress,
            ethAmount,
            minAmount
        );
        
        emit StargateTransferInitiated(escrowId, stargateChainId, ethAmount);
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            address(0), // ETH on destination
            ethAmount,
            "stargate-eth",
            false
        );
    }
    
    /**
     * @notice Handle token transfer via Stargate (converts to ETH first)
     */
    function _handleTokenStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId
    ) internal {
        // Convert token to ETH using Uniswap
        uint256 ethAmount = _swapTokenToETH(escrow.depositToken, escrow.netAmount);
        
        // Create temporary escrow data for ETH transfer
        EscrowDeposit memory ethEscrow = EscrowDeposit({
            buyer: escrow.buyer,
            seller: escrow.seller,
            depositToken: address(0), // ETH
            depositAmount: ethAmount,
            netAmount: ethAmount,
            targetToken: escrow.targetToken,
            targetChainId: escrow.targetChainId,
            released: false,
            conditionMet: true,
            timestamp: block.timestamp,
            transactionId: escrow.transactionId
        });
        
        // Execute ETH transfer via Stargate
        _handleETHStargateTransfer(escrowId, ethEscrow, stargateChainId);
    }
    
    /**
     * @notice Swap any token to ETH using Uniswap
     */
    function _swapTokenToETH(address token, uint256 amount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = address(WETH);
        
        IERC20(token).safeIncreaseAllowance(address(uniswapRouter), amount);
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
        uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
            amount,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        // Convert WETH to ETH
        uint256 wethAmount = swapAmounts[1];
        IWETH(address(WETH)).withdraw(wethAmount);
        
        return wethAmount;
    }
    
    /**
     * @notice Initialize Stargate configuration for testnets
     */
    function _initializeStargateConfig() internal {
        // Sepolia
        stargateRouters[11155111] = 0x2836045A50744FB50D3d04a9C8D18aD7B5012102;
        stargateRouterETHs[11155111] = 0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D;
        chainIdToStargateId[11155111] = 10161; // Stargate ID for Sepolia
        
        // Arbitrum Sepolia
        stargateRouters[421614] = 0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc;
        stargateRouterETHs[421614] = 0x771A4f8a880b499A40c8fF53c7925798E0f2E594;
        chainIdToStargateId[421614] = 10231; // Stargate ID for Arbitrum Sepolia
        
        // USDC pool IDs (example)
        tokenToPoolId[0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590] = 1; // Sepolia USDC
        tokenToPoolId[0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773] = 1; // Arbitrum USDC
    }
    
    /**
     * @notice Set cross-chain mode for a specific chain
     * @param chainId The target chain ID
     * @param mode The cross-chain mode (DISABLED, LAYERZERO_OFT, STARGATE)
     */
    function setCrossChainMode(uint256 chainId, CrossChainMode mode) external onlyOwner {
        crossChainModes[chainId] = mode;
        emit CrossChainModeSet(chainId, mode);
    }
    
    /**
     * @notice Get Stargate quote for cross-chain transfer
     * @param targetChainId Target chain ID
     * @param amount Amount to transfer
     * @return fee The estimated LayerZero fee
     * @return minAmountOut Minimum amount out after bridge
     */
    function getStargateQuote(
        uint256 targetChainId,
        uint256 amount
    ) external view returns (uint256 fee, uint256 minAmountOut) {
        uint16 stargateChainId = chainIdToStargateId[targetChainId];
        require(stargateChainId != 0, "Stargate not configured");
        
        address routerETH = stargateRouterETHs[block.chainid];
        require(routerETH != address(0), "RouterETH not configured");
        
        // Prepare parameters for quote
        bytes memory toAddress = abi.encodePacked(msg.sender);
        
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        // Get quote from Stargate
        (fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
            stargateChainId,
            toAddress,
            lzTxParams
        );
        
        // Calculate minimum amount out with slippage
        minAmountOut = amount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
    }
    
    /**
     * @notice Check if Stargate is available for a target chain
     * @param targetChainId Target chain ID
     * @return available True if Stargate is configured and enabled
     */
    function isStargateAvailable(uint256 targetChainId) external view returns (bool available) {
        return chainIdToStargateId[targetChainId] != 0 && 
               stargateRouterETHs[block.chainid] != address(0) &&
               crossChainModes[targetChainId] == CrossChainMode.STARGATE;
    }
    
    /**
     * @notice Get cross-chain mode for a target chain
     * @param targetChainId Target chain ID
     * @return mode The configured cross-chain mode
     */
    function getCrossChainMode(uint256 targetChainId) external view returns (CrossChainMode mode) {
        return crossChainModes[targetChainId];
    }
    
    /**
     * @notice Get comprehensive transfer options for a target chain
     * @param targetChainId Target chain ID
     * @return sameChain True if same chain
     * @return hasLayerZero True if LayerZero OFT is available
     * @return hasStargate True if Stargate is available
     * @return preferredMode The preferred cross-chain mode
     */
    function getTransferOptions(uint256 targetChainId) external view returns (
        bool sameChain,
        bool hasLayerZero,
        bool hasStargate,
        CrossChainMode preferredMode
    ) {
        sameChain = (targetChainId == block.chainid);
        hasLayerZero = (chainIdToEndpointId[targetChainId] != 0);
        hasStargate = (chainIdToStargateId[targetChainId] != 0 && stargateRouterETHs[block.chainid] != address(0));
        preferredMode = crossChainModes[targetChainId];
    }
    
    /**
     * @notice Set Stargate router addresses
     */
    function setStargateRouter(
        uint256 chainId,
        address router,
        address routerETH
    ) external onlyOwner {
        stargateRouters[chainId] = router;
        stargateRouterETHs[chainId] = routerETH;
        emit StargateRouterSet(chainId, router, routerETH);
    }
    
    /**
     * @notice Set Stargate chain ID mapping
     */
    function setStargateChainId(uint256 chainId, uint16 stargateId) external onlyOwner {
        chainIdToStargateId[chainId] = stargateId;
    }
    
    /**
     * @notice Emergency function to disable Stargate for a chain
     * @param chainId Chain ID to disable
     */
    function disableStargate(uint256 chainId) external onlyOwner {
        crossChainModes[chainId] = CrossChainMode.DISABLED;
        emit CrossChainModeSet(chainId, CrossChainMode.DISABLED);
    }
    
    /**
     * @notice Receive ETH for WETH unwrapping
     */
    receive() external payable override {
        // Allow receiving ETH from WETH contract
    }
}