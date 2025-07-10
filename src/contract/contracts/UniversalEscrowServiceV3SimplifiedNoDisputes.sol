// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IWETH
 * @notice Interface for WETH (Wrapped ETH)
 */
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title IUniswapV2Router
 * @notice Simplified Uniswap V2 Router interface for token swaps
 */
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
    
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

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
 * @title UniversalEscrowServiceV3SimplifiedNoDisputes
 * @notice Simplified escrow service using only Stargate for cross-chain transfers
 * @dev Production version without dispute resolution for immediate release upon condition met
 */
contract UniversalEscrowServiceV3SimplifiedNoDisputes is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct EscrowDeposit {
        address buyer;
        address seller;
        address depositToken;
        uint256 depositAmount;
        uint256 netAmount;
        address targetToken;
        uint256 targetChainId;
        bool released;
        bool conditionMet;
        uint256 timestamp;
        bytes32 transactionId;
    }
    
    struct TokenConfig {
        uint256 poolId;
        bool isNative;
        bool supported;
    }
    
    // Stargate Pool IDs
    uint256 constant STARGATE_USDC_POOL = 1;
    uint256 constant STARGATE_USDT_POOL = 2;
    uint256 constant STARGATE_ETH_POOL = 13;
    
    // State variables
    address public serviceWallet;
    uint256 public constant SERVICE_FEE_BPS = 200; // 2%
    uint256 public constant MAX_BPS = 10000;
    uint256 public maxSlippageBps = 500; // 5% default
    
    // Escrow storage
    mapping(bytes32 => EscrowDeposit) public escrows;
    mapping(address => bytes32[]) public userEscrows;
    mapping(address => bool) public conditionUpdaters;
    
    // Stargate configuration
    mapping(uint256 => mapping(address => TokenConfig)) public tokenConfigs;
    mapping(uint256 => address) public stargateRouters;
    mapping(uint256 => address) public stargateRouterETHs;
    mapping(uint256 => uint16) public chainIdToStargateId;
    
    // External contracts
    IWETH public immutable WETH;
    IUniswapV2Router public immutable uniswapRouter;
    
    // Events
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address depositToken,
        uint256 depositAmount,
        uint256 serviceFee,
        uint256 netAmount,
        address targetToken,
        uint256 targetChainId
    );
    
    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed seller,
        address finalToken,
        uint256 finalAmount,
        string method
    );
    
    event ConditionUpdated(
        bytes32 indexed escrowId,
        bool conditionMet,
        address updatedBy
    );
    
    event ServiceFeeCollected(
        bytes32 indexed escrowId,
        address token,
        uint256 amount
    );
    
    event StargateTransferInitiated(
        bytes32 indexed escrowId,
        uint16 indexed dstChainId,
        address indexed token,
        uint256 amount
    );
    
    // Errors
    error InvalidAmount();
    error InvalidRecipient();
    error EscrowNotFound();
    error EscrowAlreadyReleased();
    error ConditionNotMet();
    error UnauthorizedCaller();
    error InvalidChainId();
    error InsufficientFee();
    error TransferFailed();
    error TokenNotSupported();
    
    modifier onlyAuthorizedUpdater() {
        if (!conditionUpdaters[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        serviceWallet = _serviceWallet;
        WETH = IWETH(_weth);
        uniswapRouter = IUniswapV2Router(_uniswapRouter);
        
        _initializeStargateConfig();
    }
    
    /**
     * @notice Initialize Stargate configuration for testnets
     */
    function _initializeStargateConfig() internal {
        // Sepolia (Chain ID: 11155111, Stargate ID: 10161)
        chainIdToStargateId[11155111] = 10161;
        stargateRouters[11155111] = 0x9E3B4692fedbc553292c264B2b303e43707eA1e8;
        stargateRouterETHs[11155111] = 0xF31d45C32c988A982bf3CF4E1d9421E7BBc2701f;
        
        // Sepolia token configurations
        tokenConfigs[11155111][address(0)] = TokenConfig({
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[11155111][0x97e5D10FB0fb3B07540dB36FA96673248896f1f8] = TokenConfig({
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
        
        // Arbitrum Sepolia (Chain ID: 421614, Stargate ID: 10231)
        chainIdToStargateId[421614] = 10231;
        stargateRouters[421614] = 0xABb70f7f39035586955F3E8D68452ab8BDC41824;
        stargateRouterETHs[421614] = 0x060a5c578c5744144d072F7322938a9aF0C92252;
        
        // Arbitrum Sepolia token configurations
        tokenConfigs[421614][address(0)] = TokenConfig({
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[421614][0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d] = TokenConfig({
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
    }
    
    /**
     * @notice Create an escrow deposit
     */
    function createEscrow(
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId
    ) external payable nonReentrant returns (bytes32 escrowId) {
        if (seller == address(0)) revert InvalidRecipient();
        if (depositAmount == 0) revert InvalidAmount();
        
        // Calculate service fee
        uint256 serviceFee = (depositAmount * SERVICE_FEE_BPS) / MAX_BPS;
        uint256 netAmount = depositAmount - serviceFee;
        
        // Generate unique escrow ID
        escrowId = keccak256(
            abi.encodePacked(
                msg.sender,
                seller,
                depositAmount,
                block.timestamp,
                block.number
            )
        );
        
        // Handle deposit based on token type
        if (depositToken == address(0)) {
            // ETH deposit
            if (msg.value != depositAmount) revert InvalidAmount();
            
            // Send service fee to service wallet
            (bool success, ) = serviceWallet.call{value: serviceFee}("");
            require(success, "Service fee transfer failed");
            
        } else {
            // ERC20 deposit
            IERC20(depositToken).safeTransferFrom(msg.sender, address(this), depositAmount);
            
            // Send service fee to service wallet
            IERC20(depositToken).safeTransfer(serviceWallet, serviceFee);
        }
        
        // Store escrow
        escrows[escrowId] = EscrowDeposit({
            buyer: msg.sender,
            seller: seller,
            depositToken: depositToken,
            depositAmount: depositAmount,
            netAmount: netAmount,
            targetToken: targetToken,
            targetChainId: targetChainId,
            released: false,
            conditionMet: false,
            timestamp: block.timestamp,
            transactionId: escrowId
        });
        
        userEscrows[msg.sender].push(escrowId);
        
        emit EscrowCreated(
            escrowId,
            msg.sender,
            seller,
            depositToken,
            depositAmount,
            serviceFee,
            netAmount,
            targetToken,
            targetChainId
        );
        
        emit ServiceFeeCollected(escrowId, depositToken, serviceFee);
    }
    
    /**
     * @notice Update escrow condition status
     */
    function updateCondition(bytes32 escrowId, bool conditionMet) external onlyAuthorizedUpdater {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        
        escrow.conditionMet = conditionMet;
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Release escrow funds to seller
     */
    function releaseEscrow(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        if (!escrow.conditionMet) revert ConditionNotMet();
        if (msg.sender != escrow.buyer && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        escrow.released = true;
        
        // Determine routing strategy
        if (escrow.targetChainId != 0 && escrow.targetChainId != block.chainid) {
            // Cross-chain transfer via Stargate
            _handleCrossChainTransfer(escrowId, escrow);
        } else {
            // Same-chain transfer
            _handleSameChainTransfer(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle same-chain transfers
     */
    function _handleSameChainTransfer(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        if (escrow.depositToken == escrow.targetToken) {
            // Direct transfer (same token)
            if (escrow.depositToken == address(0)) {
                (bool success, ) = escrow.seller.call{value: escrow.netAmount}("");
                require(success, "ETH transfer failed");
            } else {
                IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
            }
            
            emit EscrowReleased(escrowId, escrow.seller, escrow.depositToken, escrow.netAmount, "direct");
        } else {
            // Token swap via Uniswap
            uint256 outputAmount = _swapTokens(escrow.depositToken, escrow.targetToken, escrow.netAmount, escrow.seller);
            emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, outputAmount, "uniswap");
        }
    }
    
    /**
     * @notice Handle cross-chain transfers via Stargate
     */
    function _handleCrossChainTransfer(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint16 stargateChainId = chainIdToStargateId[escrow.targetChainId];
        if (stargateChainId == 0) revert InvalidChainId();
        
        // Check if token is directly supported by Stargate
        TokenConfig memory sourceConfig = tokenConfigs[block.chainid][escrow.depositToken];
        TokenConfig memory targetConfig = tokenConfigs[escrow.targetChainId][escrow.targetToken];
        
        if (sourceConfig.supported && targetConfig.supported && sourceConfig.poolId == targetConfig.poolId) {
            // Direct Stargate transfer (same token on both chains)
            _transferViaStargate(escrowId, escrow, stargateChainId, sourceConfig);
        } else {
            // Convert to best supported token then bridge
            (address bridgeToken, TokenConfig memory bridgeConfig) = _getBestBridgeToken(escrow.targetChainId);
            
            uint256 bridgeAmount = escrow.netAmount;
            if (escrow.depositToken != bridgeToken) {
                bridgeAmount = _swapTokens(escrow.depositToken, bridgeToken, escrow.netAmount, address(this));
            }
            
            // Update escrow data for bridge token
            EscrowDeposit memory bridgeEscrow = escrow;
            bridgeEscrow.depositToken = bridgeToken;
            bridgeEscrow.netAmount = bridgeAmount;
            
            _transferViaStargate(escrowId, bridgeEscrow, stargateChainId, bridgeConfig);
        }
    }
    
    /**
     * @notice Execute Stargate transfer
     */
    function _transferViaStargate(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory config
    ) internal {
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        uint256 minAmount = escrow.netAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        if (config.isNative) {
            // Native ETH transfer via RouterETH
            address routerETH = stargateRouterETHs[block.chainid];
            require(routerETH != address(0), "RouterETH not configured");
            
            // Get fee quote
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
            
            if (msg.value < fee) revert InsufficientFee();
            
            // Execute transfer
            IStargateRouterETH(routerETH).swapETH{value: escrow.netAmount + fee}(
                stargateChainId,
                payable(msg.sender),
                toAddress,
                escrow.netAmount,
                minAmount
            );
            
            emit StargateTransferInitiated(escrowId, stargateChainId, address(0), escrow.netAmount);
        } else {
            // ERC20 transfer via Router
            address router = stargateRouters[block.chainid];
            require(router != address(0), "Router not configured");
            
            // Get fee quote
            IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: ""
            });
            
            (uint256 fee, ) = IStargateRouter(router).quoteLayerZeroFee(
                stargateChainId,
                1, // TYPE_SWAP_REMOTE
                toAddress,
                "",
                lzTxParams
            );
            
            if (msg.value < fee) revert InsufficientFee();
            
            // Approve and execute transfer
            IERC20(escrow.depositToken).safeIncreaseAllowance(router, escrow.netAmount);
            
            IStargateRouter(router).swap{value: fee}(
                stargateChainId,
                config.poolId,
                config.poolId,
                payable(msg.sender),
                escrow.netAmount,
                minAmount,
                lzTxParams,
                toAddress,
                ""
            );
            
            emit StargateTransferInitiated(escrowId, stargateChainId, escrow.depositToken, escrow.netAmount);
        }
        
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, escrow.netAmount, "stargate");
    }
    
    /**
     * @notice Swap tokens using Uniswap
     */
    function _swapTokens(
        address fromToken,
        address toToken,
        uint256 amount,
        address recipient
    ) internal returns (uint256) {
        if (fromToken == toToken) return amount;
        
        address[] memory path = new address[](2);
        path[0] = fromToken == address(0) ? address(WETH) : fromToken;
        path[1] = toToken == address(0) ? address(WETH) : toToken;
        
        if (fromToken == address(0)) {
            // ETH to token
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: amount}(
                minAmountOut,
                path,
                recipient,
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        } else if (toToken == address(0)) {
            // Token to ETH
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForETH(
                amount,
                minAmountOut,
                path,
                recipient,
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        } else {
            // Token to token
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                path,
                recipient,
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        }
    }
    
    /**
     * @notice Get best bridge token for target chain
     */
    function _getBestBridgeToken(uint256 targetChainId) internal view returns (address token, TokenConfig memory config) {
        // Priority: ETH > USDC > USDT
        if (tokenConfigs[block.chainid][address(0)].supported && 
            tokenConfigs[targetChainId][address(0)].supported) {
            return (address(0), tokenConfigs[block.chainid][address(0)]);
        }
        
        // Check USDC
        address usdcAddress = _getUSDCAddress(block.chainid);
        if (usdcAddress != address(0) && 
            tokenConfigs[block.chainid][usdcAddress].supported &&
            tokenConfigs[targetChainId][_getUSDCAddress(targetChainId)].supported) {
            return (usdcAddress, tokenConfigs[block.chainid][usdcAddress]);
        }
        
        revert TokenNotSupported();
    }
    
    /**
     * @notice Get USDC address for chain
     */
    function _getUSDCAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == 11155111) return 0x97e5D10FB0fb3B07540dB36FA96673248896f1f8; // Sepolia USDC
        if (chainId == 421614) return 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d; // Arbitrum Sepolia USDC
        return address(0);
    }
    
    /**
     * @notice Configure Stargate token support
     */
    function configureStargateToken(
        uint256 chainId,
        address tokenAddress,
        uint256 poolId,
        bool isNative
    ) external onlyOwner {
        tokenConfigs[chainId][tokenAddress] = TokenConfig({
            poolId: poolId,
            isNative: isNative,
            supported: true
        });
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
    ) external view returns (uint256 fee, uint256 minAmountOut) {
        uint16 stargateChainId = chainIdToStargateId[targetChainId];
        require(stargateChainId != 0, "Chain not supported");
        
        TokenConfig memory config = tokenConfigs[block.chainid][tokenAddress];
        require(config.supported, "Token not supported");
        
        bytes memory toAddress = abi.encodePacked(msg.sender);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        if (config.isNative) {
            address routerETH = stargateRouterETHs[block.chainid];
            require(routerETH != address(0), "RouterETH not configured");
            
            (fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
                stargateChainId,
                toAddress,
                lzTxParams
            );
        } else {
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
        
        minAmountOut = amount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
    }
    
    /**
     * @notice Update service wallet
     */
    function setServiceWallet(address _serviceWallet) external onlyOwner {
        serviceWallet = _serviceWallet;
    }
    
    /**
     * @notice Update max slippage
     */
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= 1000, "Max 10% slippage");
        maxSlippageBps = _maxSlippageBps;
    }
    
    /**
     * @notice Set condition updater authorization
     */
    function setConditionUpdater(address updater, bool authorized) external onlyOwner {
        conditionUpdaters[updater] = authorized;
    }
    
    /**
     * @notice Get escrow details
     */
    function getEscrow(bytes32 escrowId) external view returns (EscrowDeposit memory) {
        return escrows[escrowId];
    }
    
    /**
     * @notice Get user's escrow IDs
     */
    function getUserEscrows(address user) external view returns (bytes32[] memory) {
        return userEscrows[user];
    }
    
    /**
     * @notice Check if Stargate is available for a specific token
     */
    function isStargateAvailable(uint256 targetChainId, address tokenAddress) external view returns (bool) {
        return chainIdToStargateId[targetChainId] != 0 && 
               tokenConfigs[targetChainId][tokenAddress].supported;
    }
    
    /**
     * @notice Emergency withdrawal
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
    
    receive() external payable {}
}