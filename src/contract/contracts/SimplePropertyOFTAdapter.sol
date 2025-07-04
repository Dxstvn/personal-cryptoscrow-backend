// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MessagingFee, SendParam, MessagingReceipt, OFTReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { IDEXAggregator } from "./interfaces/IDEXAggregator.sol";

/**
 * @title IWETH
 * @notice Interface for WETH (Wrapped ETH)
 */
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title SimplePropertyOFTAdapter
 * @notice Dynamic Multi-Bridge OFT Adapter with optimal token routing
 * @dev Supports multiple bridge tokens with intelligent routing for cost efficiency
 */
contract SimplePropertyOFTAdapter is OFTAdapter {
    using SafeERC20 for IERC20;
    
    // Supported bridge tokens
    IWETH public immutable WETH;
    IERC20 public immutable USDC;
    IERC20 public immutable USDT;
    
    // DEX aggregator for token swaps
    IDEXAggregator public dexAggregator;
    
    // Safety settings
    uint256 public maxSlippageBps = 300; // 3% default slippage
    
    // Bridge token priority settings
    mapping(address => uint256) public bridgeTokenPriority; // Higher = more preferred
    mapping(uint32 => mapping(address => bool)) public bridgeTokenAvailability; // chainId => token => available
    
    // Track wrapped token deposits for unwrapping
    mapping(address => mapping(address => uint256)) public wrappedDeposits; // user => token => amount
    
    // Authorized contracts that can call release functions (escrow contracts)
    mapping(address => bool) public authorizedReleaseCallers;
    
    // Events
    event TokenWrapped(address indexed user, address indexed token, uint256 amount);
    event TokenUnwrapped(address indexed user, address indexed token, uint256 amount);
    event TokenSwapExecuted(
        address indexed user,
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut
    );
    event ConvertAndSendExecuted(
        address indexed user,
        address indexed sourceToken,
        uint256 sourceAmount,
        address indexed bridgeToken,
        uint256 bridgeAmount,
        uint32 dstEid,
        address recipient
    );
    event FundsReleasedAndConverted(
        address indexed seller,
        address indexed bridgeToken,
        uint256 bridgeAmount,
        address indexed targetToken,
        uint256 targetAmount
    );
    event BridgeTokenConfigured(address indexed token, uint256 priority, bool available);
    event OptimalBridgeSelected(address indexed sourceToken, address indexed bridgeToken, uint256 estimatedSavings);
    event DEXAggregatorUpdated(address indexed oldAggregator, address indexed newAggregator);
    event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
    event ReleaseCallerUpdated(address indexed caller, bool authorized);
    
    // Errors
    error InsufficientPayment();
    error SameTokenSwap();
    error SwapSlippageExceeded();
    error DEXNotSet();
    error InvalidAmount();
    error UnauthorizedCaller();
    
    // Modifiers
    modifier onlyAuthorizedReleaser() {
        if (!authorizedReleaseCallers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }
    
    /**
     * @dev Constructor
     * @param _weth WETH token address
     * @param _usdc USDC token address  
     * @param _usdt USDT token address
     * @param _lzEndpoint LayerZero V2 endpoint address
     * @param _delegate Delegate for OApp configurations
     * @param _dexAggregator DEX aggregator address (can be zero initially)
     */
    constructor(
        address _weth,
        address _usdc,
        address _usdt,
        address _lzEndpoint,
        address _delegate,
        address _dexAggregator
    ) OFTAdapter(_weth, _lzEndpoint, _delegate) Ownable(_delegate) {
        WETH = IWETH(_weth);
        USDC = IERC20(_usdc);
        USDT = IERC20(_usdt);
        dexAggregator = IDEXAggregator(_dexAggregator);
        
        // Set default bridge token priorities (higher = more preferred)
        bridgeTokenPriority[_usdc] = 1000;  // USDC highest priority (stable, universal)
        bridgeTokenPriority[_usdt] = 900;   // USDT second (stable, but less preferred)
        bridgeTokenPriority[_weth] = 800;   // WETH third (volatile but good for ETH-like tokens)
        bridgeTokenPriority[address(0)] = 700; // Native ETH fourth
    }
    
    /**
     * @notice Intelligently convert and send tokens cross-chain with optimal bridge selection
     * @dev Automatically selects best bridge token based on cost, liquidity, and availability
     * @param sourceToken Token to convert (address(0) for ETH)
     * @param sourceAmount Amount of source token to convert
     * @param minBridgeAmount Minimum bridge token amount expected after conversion
     * @param sendParam Cross-chain send parameters
     * @param fee LayerZero messaging fee
     * @param refundAddress Address to receive refunds
     * @param preferredBridgeToken Optional preferred bridge token (address(0) for auto-select)
     */
    function convertAndSend(
        address sourceToken,
        uint256 sourceAmount,
        uint256 minBridgeAmount,
        SendParam calldata sendParam,
        MessagingFee calldata fee,
        address payable refundAddress,
        address preferredBridgeToken
    ) external payable returns (address bridgeToken, uint256 bridgeAmount) {
        if (sourceAmount == 0) revert InvalidAmount();
        
        // Step 1: Determine optimal bridge token
        bridgeToken = _selectOptimalBridgeToken(sourceToken, sourceAmount, sendParam.dstEid, preferredBridgeToken);
        
        // Step 2: Handle payment and source token transfer
        if (sourceToken == address(0)) {
            // Native ETH
            if (msg.value < sourceAmount + fee.nativeFee) revert InsufficientPayment();
        } else {
            // ERC20 token
            if (msg.value < fee.nativeFee) revert InsufficientPayment();
            IERC20(sourceToken).safeTransferFrom(msg.sender, address(this), sourceAmount);
        }
        
        // Step 3: Convert to bridge token
        bridgeAmount = _convertToBridgeToken(sourceToken, sourceAmount, bridgeToken, minBridgeAmount);
        
        // Ensure minimum amount met
        if (bridgeAmount < minBridgeAmount) revert SwapSlippageExceeded();
        
        // Step 4: Track for potential unwrapping (only if conversion happened)
        if (sourceToken != bridgeToken) {
            wrappedDeposits[msg.sender][sourceToken] += sourceAmount;
            emit TokenWrapped(msg.sender, sourceToken, sourceAmount);
        }
        
        // Step 5: Send bridge token cross-chain
        SendParam memory modifiedParams = sendParam;
        modifiedParams.amountLD = bridgeAmount;
        _internalSend(modifiedParams, fee, refundAddress);
        
        emit ConvertAndSendExecuted(
            msg.sender,
            sourceToken,
            sourceAmount,
            bridgeToken,
            bridgeAmount,
            sendParam.dstEid,
            _addressFromBytes32(sendParam.to)
        );
        
        return (bridgeToken, bridgeAmount);
    }
    
    /**
     * @dev Internal send function that handles WETH from contract balance
     */
    function _internalSend(
        SendParam memory sendParam,
        MessagingFee memory fee,
        address refundAddress
    ) internal {
        // The _debit function will handle the WETH in the contract
        (uint256 amountSentLD, uint256 amountReceivedLD) = _debit(
            address(this), // from this contract (has the WETH)
            sendParam.amountLD,
            sendParam.minAmountLD,
            sendParam.dstEid
        );
        
        // Build the cross-chain message
        bytes memory message = abi.encode(sendParam.to, amountReceivedLD);
        
        // Send via LayerZero
        _lzSend(
            sendParam.dstEid,
            message,
            sendParam.extraOptions,
            fee,
            refundAddress
        );
        
        // Emit OFT sent event  
        emit OFTSent(bytes32(0), sendParam.dstEid, msg.sender, amountSentLD, amountReceivedLD);
    }
    
    
    /**
     * @notice Execute same-chain token swap dynamically
     * @param fromToken Source token (address(0) for ETH)
     * @param toToken Destination token (address(0) for ETH)
     * @param amount Amount to swap
     * @param minReturn Minimum expected return
     */
    function swapTokens(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 minReturn
    ) external payable returns (uint256 returnAmount) {
        if (fromToken == toToken) revert SameTokenSwap();
        if (amount == 0) revert InvalidAmount();
        if (address(dexAggregator) == address(0)) revert DEXNotSet();
        
        if (fromToken == address(0)) {
            // Swapping from ETH
            if (msg.value != amount) revert InsufficientPayment();
            returnAmount = _executeSwap(address(0), toToken, amount, minReturn, msg.sender);
        } else {
            // Swapping from ERC20
            IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amount);
            returnAmount = _executeSwap(fromToken, toToken, amount, minReturn, msg.sender);
        }
        
        if (returnAmount < minReturn) revert SwapSlippageExceeded();
        
        emit TokenSwapExecuted(msg.sender, fromToken, toToken, amount, returnAmount);
        
        return returnAmount;
    }
    
    /**
     * @notice Release bridge tokens and convert to seller's desired token
     * @dev Called when escrow releases funds to seller
     * @param bridgeToken The bridge token being released (WETH, USDC, USDT, etc.)
     * @param bridgeAmount Amount of bridge token to convert
     * @param targetToken Token seller wants to receive (address(0) for ETH)
     * @param minTargetAmount Minimum amount of target token expected
     * @param seller Address to receive the converted tokens
     */
    function releaseAndConvert(
        address bridgeToken,
        uint256 bridgeAmount,
        address targetToken,
        uint256 minTargetAmount,
        address seller
    ) external payable onlyAuthorizedReleaser returns (uint256 targetAmount) {
        if (bridgeAmount == 0) revert InvalidAmount();
        
        // Transfer bridge token from caller (escrow contract)
        if (bridgeToken == address(0)) {
            // Handle native ETH (though less common for bridge tokens)
            require(msg.value >= bridgeAmount, "Insufficient ETH sent");
        } else {
            IERC20(bridgeToken).safeTransferFrom(msg.sender, address(this), bridgeAmount);
        }
        
        // Convert bridge token to target token
        targetAmount = _convertFromBridgeToken(bridgeToken, bridgeAmount, targetToken, minTargetAmount, seller);
        
        // Ensure minimum amount met
        if (targetAmount < minTargetAmount) revert SwapSlippageExceeded();
        
        emit FundsReleasedAndConverted(seller, bridgeToken, bridgeAmount, targetToken, targetAmount);
        
        return targetAmount;
    }
    
    /**
     * @notice Batch release and convert for multiple sellers
     * @dev Efficient processing of multiple releases in one transaction
     */
    function batchReleaseAndConvert(
        address[] calldata bridgeTokens,
        uint256[] calldata bridgeAmounts,
        address[] calldata targetTokens,
        uint256[] calldata minTargetAmounts,
        address[] calldata sellers
    ) external payable onlyAuthorizedReleaser returns (uint256[] memory targetAmounts) {
        require(
            bridgeTokens.length == bridgeAmounts.length &&
            bridgeAmounts.length == targetTokens.length &&
            targetTokens.length == minTargetAmounts.length &&
            minTargetAmounts.length == sellers.length,
            "Array length mismatch"
        );
        
        targetAmounts = new uint256[](bridgeAmounts.length);
        
        for (uint256 i = 0; i < bridgeAmounts.length; i++) {
            // Transfer bridge token from caller
            if (bridgeTokens[i] == address(0)) {
                require(msg.value >= bridgeAmounts[i], "Insufficient ETH sent");
            } else {
                IERC20(bridgeTokens[i]).safeTransferFrom(msg.sender, address(this), bridgeAmounts[i]);
            }
            
            // Convert and send to seller
            targetAmounts[i] = _convertFromBridgeToken(
                bridgeTokens[i],
                bridgeAmounts[i],
                targetTokens[i],
                minTargetAmounts[i],
                sellers[i]
            );
            
            if (targetAmounts[i] < minTargetAmounts[i]) revert SwapSlippageExceeded();
            
            emit FundsReleasedAndConverted(
                sellers[i],
                bridgeTokens[i],
                bridgeAmounts[i],
                targetTokens[i],
                targetAmounts[i]
            );
        }
        
        return targetAmounts;
    }
    
    /**
     * @notice Preview conversion from bridge token to target token
     * @dev View function to estimate conversion rates
     */
    function previewBridgeConversion(
        address bridgeToken,
        address targetToken,
        uint256 bridgeAmount
    ) external view returns (uint256 estimatedAmount) {
        if (bridgeToken == targetToken) {
            // Same token - 1:1 conversion
            return bridgeAmount;
        }
        
        if ((bridgeToken == address(0) && targetToken == address(WETH)) ||
            (bridgeToken == address(WETH) && targetToken == address(0))) {
            // ETH/WETH conversion - 1:1
            return bridgeAmount;
        }
        
        // For other tokens, would need to query DEX (simplified here)
        // In production, this could call the DEX aggregator's quote function
        return bridgeAmount; // Placeholder - implement actual DEX quoting
    }
    
    /**
     * @notice Get optimal bridge token for a route
     * @dev View function to preview optimal bridge selection
     */
    function getOptimalBridgeToken(
        address sourceToken,
        uint32 dstChainId,
        address preferredBridgeToken
    ) external view returns (address optimalBridge, uint256 priority) {
        optimalBridge = _selectOptimalBridgeToken(sourceToken, 0, dstChainId, preferredBridgeToken);
        priority = bridgeTokenPriority[optimalBridge];
        return (optimalBridge, priority);
    }
    
    /**
     * @notice Unwrap tokens back to original form
     * @param originalToken The original token that was wrapped (address(0) for ETH)
     * @param amount Amount to unwrap
     */
    function unwrapToken(address originalToken, uint256 amount) external {
        if (wrappedDeposits[msg.sender][originalToken] < amount) revert InvalidAmount();
        
        // Update tracking first
        wrappedDeposits[msg.sender][originalToken] -= amount;
        
        if (originalToken == address(0)) {
            // Unwrap WETH back to ETH
            WETH.transferFrom(msg.sender, address(this), amount);
            WETH.withdraw(amount);
            
            // Send ETH to user
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // For other tokens, this would require reverse conversion through DEX
            // For now, we'll keep it simple and just transfer WETH
            WETH.transferFrom(msg.sender, address(this), amount);
            IERC20(originalToken).safeTransfer(msg.sender, amount);
        }
        
        emit TokenUnwrapped(msg.sender, originalToken, amount);
    }
    
    /**
     * @dev Override _debit to handle WETH in contract
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        // Check if the contract has WETH balance (from wrapping)
        uint256 contractBalance = WETH.balanceOf(address(this));
        
        if (contractBalance >= _amountLD) {
            // Contract has WETH from wrapping, use it directly
            // The WETH is already in this contract, just return the amounts
            return (_amountLD, _amountLD);
        } else {
            // Normal flow - user has approved WETH
            return super._debit(_from, _amountLD, _minAmountLD, _dstEid);
        }
    }
    
    /**
     * @dev Select optimal bridge token based on priorities and availability
     */
    function _selectOptimalBridgeToken(
        address sourceToken,
        uint256, /* sourceAmount - unused but kept for future enhancements */
        uint32 dstChainId,
        address preferredBridgeToken
    ) internal view returns (address optimalBridge) {
        // Priority 1: Direct bridging if same token exists on destination
        if (_isTokenAvailableOnChain(sourceToken, dstChainId)) {
            return sourceToken; // No conversion needed - optimal!
        }
        
        // Priority 2: Use preferred bridge token if specified and available
        if (preferredBridgeToken != address(0) && _isTokenAvailableOnChain(preferredBridgeToken, dstChainId)) {
            return preferredBridgeToken;
        }
        
        // Priority 3: Select highest priority available bridge token
        address[] memory bridgeTokens = _getSupportedBridgeTokens();
        uint256 highestPriority = 0;
        address bestBridge = address(USDC); // Default to USDC
        
        for (uint256 i = 0; i < bridgeTokens.length; i++) {
            address token = bridgeTokens[i];
            if (_isTokenAvailableOnChain(token, dstChainId) && 
                bridgeTokenPriority[token] > highestPriority) {
                highestPriority = bridgeTokenPriority[token];
                bestBridge = token;
            }
        }
        
        return bestBridge;
    }
    
    /**
     * @dev Convert source token to selected bridge token
     */
    function _convertToBridgeToken(
        address sourceToken,
        uint256 sourceAmount,
        address bridgeToken,
        uint256 minBridgeAmount
    ) internal returns (uint256 bridgeAmount) {
        // Direct transfer if same token
        if (sourceToken == bridgeToken) {
            return sourceAmount;
        }
        
        // ETH to WETH direct wrapping
        if (sourceToken == address(0) && bridgeToken == address(WETH)) {
            WETH.deposit{value: sourceAmount}();
            return sourceAmount;
        }
        
        // WETH to ETH direct unwrapping
        if (sourceToken == address(WETH) && bridgeToken == address(0)) {
            WETH.withdraw(sourceAmount);
            return sourceAmount;
        }
        
        // All other conversions via DEX
        if (address(dexAggregator) == address(0)) revert DEXNotSet();
        
        bridgeAmount = _executeSwap(
            sourceToken,
            bridgeToken,
            sourceAmount,
            minBridgeAmount,
            address(this)
        );
        
        return bridgeAmount;
    }
    
    /**
     * @dev Convert bridge token to target token for seller
     */
    function _convertFromBridgeToken(
        address bridgeToken,
        uint256 bridgeAmount,
        address targetToken,
        uint256 minTargetAmount,
        address recipient
    ) internal returns (uint256 targetAmount) {
        // Direct transfer if same token
        if (bridgeToken == targetToken) {
            if (targetToken == address(0)) {
                // Send ETH
                (bool success, ) = recipient.call{value: bridgeAmount}("");
                require(success, "ETH transfer failed");
            } else {
                // Send ERC20
                IERC20(targetToken).safeTransfer(recipient, bridgeAmount);
            }
            return bridgeAmount;
        }
        
        // WETH to ETH direct unwrapping
        if (bridgeToken == address(WETH) && targetToken == address(0)) {
            WETH.withdraw(bridgeAmount);
            (bool success, ) = recipient.call{value: bridgeAmount}("");
            require(success, "ETH transfer failed");
            return bridgeAmount;
        }
        
        // ETH to WETH direct wrapping (less common)
        if (bridgeToken == address(0) && targetToken == address(WETH)) {
            WETH.deposit{value: bridgeAmount}();
            WETH.transfer(recipient, bridgeAmount);
            return bridgeAmount;
        }
        
        // All other conversions via DEX
        if (address(dexAggregator) == address(0)) revert DEXNotSet();
        
        targetAmount = _executeSwap(
            bridgeToken,
            targetToken,
            bridgeAmount,
            minTargetAmount,
            recipient
        );
        
        return targetAmount;
    }
    
    /**
     * @dev Get list of supported bridge tokens
     */
    function _getSupportedBridgeTokens() internal view returns (address[] memory) {
        address[] memory tokens = new address[](4);
        tokens[0] = address(USDC);
        tokens[1] = address(USDT);
        tokens[2] = address(WETH);
        tokens[3] = address(0); // Native ETH
        return tokens;
    }
    
    /**
     * @dev Check if token is available on destination chain
     */
    function _isTokenAvailableOnChain(address token, uint32 chainId) internal view returns (bool) {
        // If no specific config set, assume common tokens are available
        if (!bridgeTokenAvailability[chainId][token]) {
            // Default availability for common tokens
            return (token == address(USDC) || 
                    token == address(USDT) || 
                    token == address(WETH) || 
                    token == address(0)); // ETH
        }
        return bridgeTokenAvailability[chainId][token];
    }
    
    /**
     * @dev Convert any token to WETH dynamically (legacy compatibility)
     */
    function _convertToWETH(address sourceToken, uint256 amount, uint256 minWETHAmount) internal returns (uint256 wethAmount) {
        if (sourceToken == address(0)) {
            // ETH to WETH - try direct wrapping first (most efficient)
            if (minWETHAmount <= amount && address(dexAggregator) == address(0)) {
                WETH.deposit{value: amount}();
                return amount;
            }
            
            // Use DEX if available and potentially better rates
            if (address(dexAggregator) != address(0)) {
                wethAmount = _executeSwap(address(0), address(WETH), amount, minWETHAmount, address(this));
                if (wethAmount >= minWETHAmount) {
                    return wethAmount;
                }
            }
            
            // Fallback to direct wrapping
            WETH.deposit{value: amount}();
            return amount;
            
        } else if (sourceToken == address(WETH)) {
            // Already WETH, no conversion needed
            return amount;
            
        } else {
            // ERC20 to WETH via DEX
            if (address(dexAggregator) == address(0)) revert DEXNotSet();
            wethAmount = _executeSwap(sourceToken, address(WETH), amount, minWETHAmount, address(this));
            return wethAmount;
        }
    }
    
    /**
     * @dev Convert WETH to any target token dynamically
     * @param targetToken Token to convert to (address(0) for ETH)
     * @param wethAmount Amount of WETH to convert
     * @param minTargetAmount Minimum target token expected
     * @param recipient Address to receive the target tokens
     */
    function _convertFromWETH(
        address targetToken,
        uint256 wethAmount,
        uint256 minTargetAmount,
        address recipient
    ) internal returns (uint256 targetAmount) {
        if (targetToken == address(0)) {
            // WETH to ETH - direct unwrapping
            WETH.withdraw(wethAmount);
            
            // Send ETH to recipient
            (bool success, ) = recipient.call{value: wethAmount}("");
            require(success, "ETH transfer failed");
            
            return wethAmount;
            
        } else if (targetToken == address(WETH)) {
            // Already WETH, just transfer
            WETH.transfer(recipient, wethAmount);
            return wethAmount;
            
        } else {
            // WETH to ERC20 via DEX
            if (address(dexAggregator) == address(0)) revert DEXNotSet();
            
            targetAmount = _executeSwap(
                address(WETH),
                targetToken,
                wethAmount,
                minTargetAmount,
                recipient
            );
            
            return targetAmount;
        }
    }
    
    /**
     * @dev Execute swap through DEX aggregator
     */
    function _executeSwap(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 minReturn,
        address receiver
    ) internal returns (uint256 returnAmount) {
        // Approve DEX aggregator if needed
        if (fromToken != address(0)) {
            IERC20(fromToken).approve(address(dexAggregator), amount);
        }
        
        // Build swap description
        IDEXAggregator.SwapDescription memory desc = IDEXAggregator.SwapDescription({
            srcToken: fromToken,
            dstToken: toToken,
            srcReceiver: address(dexAggregator),
            dstReceiver: receiver,
            amount: amount,
            minReturnAmount: minReturn,
            flags: 0
        });
        
        // Execute swap
        if (fromToken == address(0)) {
            returnAmount = dexAggregator.swap{value: amount}(desc, "");
        } else {
            returnAmount = dexAggregator.swap(desc, "");
        }
        
        return returnAmount;
    }
    
    /**
     * @dev Convert bytes32 to address
     */
    function _addressFromBytes32(bytes32 _bytes) internal pure returns (address) {
        return address(uint160(uint256(_bytes)));
    }
    
    // Admin functions
    
    /**
     * @notice Update DEX aggregator address
     */
    function setDEXAggregator(address _dexAggregator) external onlyOwner {
        address oldAggregator = address(dexAggregator);
        dexAggregator = IDEXAggregator(_dexAggregator);
        emit DEXAggregatorUpdated(oldAggregator, _dexAggregator);
    }
    
    
    /**
     * @notice Update slippage tolerance
     */
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= 1000, "Slippage too high"); // Max 10%
        uint256 oldSlippage = maxSlippageBps;
        maxSlippageBps = _maxSlippageBps;
        emit SlippageUpdated(oldSlippage, _maxSlippageBps);
    }
    
    /**
     * @notice Authorize/unauthorize contracts to call release functions
     * @param caller Address to authorize (typically escrow contracts)
     * @param authorized Whether to authorize or revoke
     */
    function setAuthorizedReleaseCaller(address caller, bool authorized) external onlyOwner {
        authorizedReleaseCallers[caller] = authorized;
        emit ReleaseCallerUpdated(caller, authorized);
    }
    
    /**
     * @notice Batch authorize multiple callers
     * @param callers Array of addresses to authorize
     * @param authorized Whether to authorize or revoke all
     */
    function batchSetAuthorizedReleaseCallers(
        address[] calldata callers,
        bool authorized
    ) external onlyOwner {
        for (uint256 i = 0; i < callers.length; i++) {
            authorizedReleaseCallers[callers[i]] = authorized;
            emit ReleaseCallerUpdated(callers[i], authorized);
        }
    }
    
    /**
     * @notice Configure bridge token priority
     * @param token Bridge token address
     * @param priority Priority level (higher = more preferred)
     */
    function setBridgeTokenPriority(address token, uint256 priority) external onlyOwner {
        bridgeTokenPriority[token] = priority;
        emit BridgeTokenConfigured(token, priority, true);
    }
    
    /**
     * @notice Configure bridge token availability on specific chain
     * @param chainId Destination chain ID (LayerZero EID)
     * @param token Bridge token address
     * @param available Whether token is available on that chain
     */
    function setBridgeTokenAvailability(uint32 chainId, address token, bool available) external onlyOwner {
        bridgeTokenAvailability[chainId][token] = available;
        emit BridgeTokenConfigured(token, bridgeTokenPriority[token], available);
    }
    
    /**
     * @notice Batch configure bridge token availability across multiple chains
     */
    function batchSetBridgeTokenAvailability(
        uint32[] calldata chainIds,
        address[] calldata tokens,
        bool[] calldata availabilities
    ) external onlyOwner {
        require(
            chainIds.length == tokens.length && 
            tokens.length == availabilities.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < chainIds.length; i++) {
            bridgeTokenAvailability[chainIds[i]][tokens[i]] = availabilities[i];
            emit BridgeTokenConfigured(tokens[i], bridgeTokenPriority[tokens[i]], availabilities[i]);
        }
    }
    
    /**
     * @notice Rescue tokens sent by mistake
     */
    function rescueTokens(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(_token != address(WETH), "Cannot rescue WETH");
        if (_token == address(0)) {
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }
    }
    
    // Receive ETH
    receive() external payable {}
}