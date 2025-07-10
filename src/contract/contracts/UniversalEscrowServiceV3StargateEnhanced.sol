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
 * @title UniversalEscrowServiceV3StargateEnhanced
 * @notice Enhanced escrow service with full Stargate integration for all supported tokens
 * @dev Supports ETH, USDC, USDT and other Stargate-supported assets
 */
contract UniversalEscrowServiceV3StargateEnhanced is UniversalEscrowServiceV3 {
    using SafeERC20 for IERC20;
    
    // Stargate Pool IDs
    uint256 constant STARGATE_USDC_POOL = 1;
    uint256 constant STARGATE_USDT_POOL = 2;
    uint256 constant STARGATE_ETH_POOL = 13;
    
    // Supported Stargate tokens configuration
    struct TokenConfig {
        address tokenAddress;
        uint256 poolId;
        bool isNative; // true for ETH, false for ERC20
        bool supported;
    }
    
    // Token configurations by chain
    mapping(uint256 => mapping(address => TokenConfig)) public tokenConfigs;
    
    // Stargate routers by chain
    mapping(uint256 => address) public stargateRouters;     // chainId => Router address
    mapping(uint256 => address) public stargateRouterETHs; // chainId => RouterETH address
    mapping(uint256 => uint16) public chainIdToStargateId; // chainId => Stargate chain ID
    
    // Cross-chain routing mode
    enum CrossChainMode {
        DISABLED,
        LAYERZERO_OFT,
        STARGATE
    }
    
    mapping(uint256 => CrossChainMode) public crossChainModes;
    
    // Events
    event StargateRouterSet(uint256 indexed chainId, address router, address routerETH);
    event CrossChainModeSet(uint256 indexed chainId, CrossChainMode mode);
    event TokenConfigured(uint256 indexed chainId, address indexed token, uint256 poolId, bool isNative);
    event TokenDisabled(uint256 indexed chainId, address indexed token);
    event StargateTransferInitiated(
        bytes32 indexed escrowId,
        uint16 indexed dstChainId,
        address indexed token,
        uint256 amount,
        address router
    );
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3(_serviceWallet, _weth, _uniswapRouter) {
        _initializeStargateConfig();
    }
    
    /**
     * @notice Initialize Stargate configuration for testnets
     */
    function _initializeStargateConfig() internal {
        // Sepolia (Chain ID: 11155111, Stargate ID: 10161)
        stargateRouters[11155111] = 0x2836045A50744FB50D3d04a9C8D18aD7B5012102;
        stargateRouterETHs[11155111] = 0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D;
        chainIdToStargateId[11155111] = 10161;
        
        // Sepolia token configurations
        tokenConfigs[11155111][address(0)] = TokenConfig({
            tokenAddress: address(0),
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[11155111][0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590] = TokenConfig({
            tokenAddress: 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590, // Sepolia USDC
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
        
        // Arbitrum Sepolia (Chain ID: 421614, Stargate ID: 10231)
        stargateRouters[421614] = 0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc;
        stargateRouterETHs[421614] = 0x771A4f8a880b499A40c8fF53c7925798E0f2E594;
        chainIdToStargateId[421614] = 10231;
        
        // Arbitrum Sepolia token configurations
        tokenConfigs[421614][address(0)] = TokenConfig({
            tokenAddress: address(0),
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[421614][0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773] = TokenConfig({
            tokenAddress: 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773, // Arbitrum Sepolia USDC
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
        
        // Set Stargate as preferred mode for supported chains
        crossChainModes[11155111] = CrossChainMode.STARGATE;
        crossChainModes[421614] = CrossChainMode.STARGATE;
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
            uint256 outputAmount = _swapToTargetToken(
                escrow.depositToken,
                escrow.targetToken,
                escrow.netAmount
            );
            
            // Transfer the swapped tokens to the seller
            if (escrow.targetToken == address(0)) {
                payable(escrow.seller).transfer(outputAmount);
            } else {
                IERC20(escrow.targetToken).safeTransfer(escrow.seller, outputAmount);
            }
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
        
        // Check if source token is supported by Stargate
        TokenConfig memory sourceTokenConfig = tokenConfigs[block.chainid][escrow.depositToken];
        TokenConfig memory targetTokenConfig = tokenConfigs[escrow.targetChainId][escrow.targetToken];
        
        // Strategy 1: Direct Stargate transfer (same token on both chains)
        if (sourceTokenConfig.supported && targetTokenConfig.supported && 
            sourceTokenConfig.poolId == targetTokenConfig.poolId) {
            _handleDirectStargateTransfer(escrowId, escrow, stargateChainId, sourceTokenConfig);
        }
        // Strategy 2: Convert to supported token then transfer
        else if (targetTokenConfig.supported) {
            _handleConvertAndStargateTransfer(escrowId, escrow, stargateChainId, targetTokenConfig);
        }
        // Strategy 3: Find best supported token for bridging
        else {
            _handleBestSupportedTokenTransfer(escrowId, escrow, stargateChainId);
        }
    }
    
    /**
     * @notice Handle direct Stargate transfer (same token on both chains)
     */
    function _handleDirectStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory tokenConfig
    ) internal {
        if (tokenConfig.isNative) {
            // Use RouterETH for native ETH
            _handleETHStargateTransfer(escrowId, escrow, stargateChainId);
        } else {
            // Use Router for ERC20 tokens
            _handleERC20StargateTransfer(escrowId, escrow, stargateChainId, tokenConfig);
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
        
        // Convert source token to ETH if needed
        if (escrow.depositToken != address(0)) {
            ethAmount = _swapToTargetToken(escrow.depositToken, address(0), escrow.netAmount);
        }
        
        // Quote the LayerZero fee
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        // Use actual Stargate quote
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
        
        emit StargateTransferInitiated(escrowId, stargateChainId, address(0), ethAmount, routerETH);
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.targetToken,
            ethAmount,
            "stargate-eth",
            false
        );
    }
    
    /**
     * @notice Handle ERC20 token transfer via Stargate Router
     */
    function _handleERC20StargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory tokenConfig
    ) internal {
        address router = stargateRouters[block.chainid];
        require(router != address(0), "Stargate Router not configured");
        
        uint256 transferAmount = escrow.netAmount;
        
        // Convert source token to target Stargate token if needed
        if (escrow.depositToken != tokenConfig.tokenAddress) {
            transferAmount = _swapToTargetToken(escrow.depositToken, tokenConfig.tokenAddress, escrow.netAmount);
        }
        
        // Quote the LayerZero fee
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        // Use actual Stargate quote
        (uint256 fee, ) = IStargateRouter(router).quoteLayerZeroFee(
            stargateChainId,
            1, // TYPE_SWAP_REMOTE
            toAddress,
            "",
            lzTxParams
        );
        
        require(msg.value >= fee, "Insufficient fee for Stargate transfer");
        
        // Approve router to spend tokens
        IERC20(tokenConfig.tokenAddress).safeIncreaseAllowance(router, transferAmount);
        
        // Calculate minimum amount with slippage
        uint256 minAmount = transferAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        // Execute Stargate swap
        IStargateRouter(router).swap{value: fee}(
            stargateChainId,
            tokenConfig.poolId,  // Source pool
            tokenConfig.poolId,  // Destination pool (same token)
            payable(msg.sender), // Refund address
            transferAmount,
            minAmount,
            lzTxParams,
            toAddress,
            ""
        );
        
        emit StargateTransferInitiated(escrowId, stargateChainId, tokenConfig.tokenAddress, transferAmount, router);
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.targetToken,
            transferAmount,
            "stargate-erc20",
            false
        );
    }
    
    /**
     * @notice Handle conversion to supported token then Stargate transfer
     */
    function _handleConvertAndStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory targetTokenConfig
    ) internal {
        // Convert source token to target token's equivalent on source chain
        TokenConfig memory sourceEquivalentConfig = tokenConfigs[block.chainid][targetTokenConfig.tokenAddress];
        
        if (!sourceEquivalentConfig.supported) {
            // No direct equivalent, find best supported token
            _handleBestSupportedTokenTransfer(escrowId, escrow, stargateChainId);
            return;
        }
        
        // Convert source token to equivalent supported token
        uint256 convertedAmount = _swapToTargetToken(
            escrow.depositToken,
            sourceEquivalentConfig.tokenAddress,
            escrow.netAmount
        );
        
        // Create temporary escrow data for converted token
        EscrowDeposit memory convertedEscrow = EscrowDeposit({
            buyer: escrow.buyer,
            seller: escrow.seller,
            depositToken: sourceEquivalentConfig.tokenAddress,
            depositAmount: convertedAmount,
            netAmount: convertedAmount,
            targetToken: escrow.targetToken,
            targetChainId: escrow.targetChainId,
            released: false,
            conditionMet: true,
            timestamp: block.timestamp,
            transactionId: escrow.transactionId
        });
        
        // Execute Stargate transfer with converted token
        _handleDirectStargateTransfer(escrowId, convertedEscrow, stargateChainId, sourceEquivalentConfig);
    }
    
    /**
     * @notice Handle transfer using best available supported token
     */
    function _handleBestSupportedTokenTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId
    ) internal {
        // Priority order: ETH > USDC > USDT
        address[] memory preferredTokens = new address[](3);
        preferredTokens[0] = address(0); // ETH
        preferredTokens[1] = tokenConfigs[block.chainid][address(0)].supported ? 
            _getTokenByPoolId(block.chainid, STARGATE_USDC_POOL) : address(0);
        preferredTokens[2] = tokenConfigs[block.chainid][address(0)].supported ? 
            _getTokenByPoolId(block.chainid, STARGATE_USDT_POOL) : address(0);
        
        for (uint256 i = 0; i < preferredTokens.length; i++) {
            if (preferredTokens[i] != address(0) && 
                tokenConfigs[block.chainid][preferredTokens[i]].supported) {
                
                TokenConfig memory bridgeTokenConfig = tokenConfigs[block.chainid][preferredTokens[i]];
                
                // Convert to bridge token
                uint256 bridgeAmount = _swapToTargetToken(
                    escrow.depositToken,
                    bridgeTokenConfig.tokenAddress,
                    escrow.netAmount
                );
                
                // Create escrow for bridge token
                EscrowDeposit memory bridgeEscrow = EscrowDeposit({
                    buyer: escrow.buyer,
                    seller: escrow.seller,
                    depositToken: bridgeTokenConfig.tokenAddress,
                    depositAmount: bridgeAmount,
                    netAmount: bridgeAmount,
                    targetToken: escrow.targetToken,
                    targetChainId: escrow.targetChainId,
                    released: false,
                    conditionMet: true,
                    timestamp: block.timestamp,
                    transactionId: escrow.transactionId
                });
                
                // Execute bridge
                _handleDirectStargateTransfer(escrowId, bridgeEscrow, stargateChainId, bridgeTokenConfig);
                return;
            }
        }
        
        revert("No supported Stargate token available for bridging");
    }
    
    /**
     * @notice Get token address by pool ID on a specific chain
     */
    function _getTokenByPoolId(uint256 chainId, uint256 poolId) internal view returns (address) {
        // Check known tokens for the pool ID
        if (poolId == STARGATE_ETH_POOL) return address(0);
        
        // For Sepolia
        if (chainId == 11155111 && poolId == STARGATE_USDC_POOL) {
            return 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590;
        }
        
        // For Arbitrum Sepolia
        if (chainId == 421614 && poolId == STARGATE_USDC_POOL) {
            return 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773;
        }
        
        return address(0);
    }
    
    /**
     * @notice Swap any token to target token using Uniswap
     * @param fromToken Source token address
     * @param toToken Target token address  
     * @param amount Amount to swap
     * @return Amount of target token received
     */
    function _swapToTargetToken(address fromToken, address toToken, uint256 amount) internal returns (uint256) {
        if (fromToken == toToken) {
            return amount; // No swap needed
        }
        
        // Handle ETH to ERC20
        if (fromToken == address(0) && toToken != address(0)) {
            return _swapETHForTokens(toToken, amount);
        }
        
        // Handle ERC20 to ETH
        if (fromToken != address(0) && toToken == address(0)) {
            return _swapTokensForETH(fromToken, amount);
        }
        
        // Handle ERC20 to ERC20
        if (fromToken != address(0) && toToken != address(0)) {
            return _swapTokensForTokens(fromToken, toToken, amount);
        }
        
        revert("Invalid token swap combination");
    }
    
    /**
     * @notice Swap ETH for ERC20 tokens
     */
    function _swapETHForTokens(address toToken, uint256 ethAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(WETH);
        path[1] = toToken;
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(ethAmount, path);
        uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: ethAmount}(
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return swapAmounts[1];
    }
    
    /**
     * @notice Swap ERC20 tokens for ETH
     */
    function _swapTokensForETH(address fromToken, uint256 amount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = address(WETH);
        
        IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
        uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForETH(
            amount,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return swapAmounts[1];
    }
    
    /**
     * @notice Swap ERC20 tokens for other ERC20 tokens
     */
    function _swapTokensForTokens(address fromToken, address toToken, uint256 amount) internal returns (uint256) {
        // Try direct path first
        address[] memory directPath = new address[](2);
        directPath[0] = fromToken;
        directPath[1] = toToken;
        
        try uniswapRouter.getAmountsOut(amount, directPath) returns (uint256[] memory amounts) {
            // Direct path exists
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                directPath,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        } catch {
            // No direct path, route through WETH
            address[] memory pathThroughWETH = new address[](3);
            pathThroughWETH[0] = fromToken;
            pathThroughWETH[1] = address(WETH);
            pathThroughWETH[2] = toToken;
            
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, pathThroughWETH);
            uint256 minAmountOut = amounts[2] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                pathThroughWETH,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[2];
        }
    }
    
    /**
     * @notice Configure Stargate token support for a specific chain
     */
    function configureStargateToken(
        uint256 chainId,
        address tokenAddress,
        uint256 poolId,
        bool isNative
    ) external onlyOwner {
        require(poolId > 0, "Invalid pool ID");
        
        tokenConfigs[chainId][tokenAddress] = TokenConfig({
            tokenAddress: tokenAddress,
            poolId: poolId,
            isNative: isNative,
            supported: true
        });
        
        emit TokenConfigured(chainId, tokenAddress, poolId, isNative);
    }
    
    /**
     * @notice Set cross-chain mode for a specific chain
     */
    function setCrossChainMode(uint256 chainId, CrossChainMode mode) external onlyOwner {
        crossChainModes[chainId] = mode;
        emit CrossChainModeSet(chainId, mode);
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
     * @notice Get Stargate quote for cross-chain transfer
     */
    function getStargateQuote(
        uint256 targetChainId,
        address tokenAddress,
        uint256 amount
    ) public view returns (uint256 fee, uint256 minAmountOut) {
        uint16 stargateChainId = chainIdToStargateId[targetChainId];
        require(stargateChainId != 0, "Stargate not configured");
        
        TokenConfig memory tokenConfig = tokenConfigs[block.chainid][tokenAddress];
        require(tokenConfig.supported, "Token not supported by Stargate");
        
        // Use actual Stargate quote
        bytes memory toAddress = abi.encodePacked(msg.sender);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        if (tokenConfig.isNative) {
            // Use RouterETH for native ETH
            address routerETH = stargateRouterETHs[block.chainid];
            require(routerETH != address(0), "RouterETH not configured");
            
            (fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
                stargateChainId,
                toAddress,
                lzTxParams
            );
        } else {
            // Use Router for ERC20 tokens
            address router = stargateRouters[block.chainid];
            require(router != address(0), "Router not configured");
            
            (fee, ) = IStargateRouter(router).quoteLayerZeroFee(
                stargateChainId,
                1, // TYPE_SWAP_REMOTE
                toAddress,
                "",
                lzTxParams
            );
        }
        
        // Calculate minimum amount out with slippage
        minAmountOut = amount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
    }
    
    /**
     * @notice Get Stargate quote for ETH transfer (backward compatibility)
     */
    function getStargateQuote(
        uint256 targetChainId,
        uint256 amount
    ) external view returns (uint256 fee, uint256 minAmountOut) {
        return this.getStargateQuote(targetChainId, address(0), amount);
    }
    
    /**
     * @notice Check if Stargate is available for a specific token
     */
    function isStargateAvailable(uint256 targetChainId, address tokenAddress) external view returns (bool available) {
        return chainIdToStargateId[targetChainId] != 0 && 
               tokenConfigs[targetChainId][tokenAddress].supported &&
               crossChainModes[targetChainId] == CrossChainMode.STARGATE;
    }
    
    /**
     * @notice Get supported tokens for Stargate on a specific chain
     */
    function getSupportedStargateTokens(uint256 chainId) external view returns (
        address[] memory tokens,
        TokenConfig[] memory configs
    ) {
        // Return known configured tokens
        address[] memory knownTokens = new address[](2);
        knownTokens[0] = address(0); // ETH
        
        if (chainId == 11155111) {
            knownTokens[1] = 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590; // Sepolia USDC
        } else if (chainId == 421614) {
            knownTokens[1] = 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773; // Arbitrum USDC
        }
        
        uint256 supportedCount = 0;
        for (uint256 i = 0; i < knownTokens.length; i++) {
            if (tokenConfigs[chainId][knownTokens[i]].supported) {
                supportedCount++;
            }
        }
        
        tokens = new address[](supportedCount);
        configs = new TokenConfig[](supportedCount);
        
        uint256 index = 0;
        for (uint256 i = 0; i < knownTokens.length; i++) {
            if (tokenConfigs[chainId][knownTokens[i]].supported) {
                tokens[index] = knownTokens[i];
                configs[index] = tokenConfigs[chainId][knownTokens[i]];
                index++;
            }
        }
    }
    
    /**
     * @notice Get token configuration
     */
    function getTokenConfig(uint256 chainId, address tokenAddress) external view returns (TokenConfig memory config) {
        return tokenConfigs[chainId][tokenAddress];
    }
    
    /**
     * @notice Get transfer options for a target chain
     */
    function getTransferOptions(uint256 targetChainId) external view returns (
        bool sameChain,
        bool hasLayerZero,
        bool hasStargate,
        CrossChainMode preferredMode
    ) {
        sameChain = (targetChainId == block.chainid);
        hasLayerZero = (chainIdToEndpointId[targetChainId] != 0);
        hasStargate = (chainIdToStargateId[targetChainId] != 0);
        preferredMode = crossChainModes[targetChainId];
    }
    
    /**
     * @notice Emergency function to disable Stargate for a chain
     */
    function disableStargate(uint256 chainId) external onlyOwner {
        crossChainModes[chainId] = CrossChainMode.DISABLED;
        emit CrossChainModeSet(chainId, CrossChainMode.DISABLED);
    }
    
    /**
     * @notice Receive ETH for WETH unwrapping and swaps
     */
    receive() external payable override {
        // Allow receiving ETH from WETH contract and Uniswap
    }
}