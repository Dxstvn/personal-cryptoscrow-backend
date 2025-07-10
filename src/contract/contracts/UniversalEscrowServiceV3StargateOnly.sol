// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
 * @title UniversalEscrowServiceV3StargateOnly
 * @notice Escrow service with Stargate-only cross-chain support (LayerZero OFT removed)
 * @dev Supports cross-chain transfers only via Stargate for configured chains/tokens
 */
contract UniversalEscrowServiceV3StargateOnly is Ownable, ReentrancyGuard {
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
    mapping(uint256 => address) public stargateRouters;     // chainId => Router address
    mapping(uint256 => address) public stargateRouterETHs; // chainId => RouterETH address
    mapping(uint256 => uint16) public chainIdToStargateId; // chainId => Stargate chain ID
    
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
    
    event TokenSwapped(
        bytes32 indexed escrowId,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 toAmount
    );
    
    event StargateTransferInitiated(
        bytes32 indexed escrowId,
        uint16 indexed dstChainId,
        address indexed token,
        uint256 amount,
        address router
    );
    
    // Errors
    error InvalidAmount();
    error InvalidRecipient();
    error EscrowNotFound();
    error EscrowAlreadyReleased();
    error ConditionNotMet();
    error UnauthorizedCaller();
    error InvalidChainId();
    error InsufficientBalance();
    error TransferFailed();
    error SwapFailed();
    error InvalidConfiguration();
    error CrossChainNotSupported();
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
        
        // Initialize Stargate configuration
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
        
        // Validate cross-chain configuration if needed
        if (targetChainId != 0 && targetChainId != block.chainid) {
            uint16 stargateChainId = chainIdToStargateId[targetChainId];
            if (stargateChainId == 0) revert CrossChainNotSupported();
            
            // Check if target token is supported on destination chain
            TokenConfig memory targetConfig = tokenConfigs[targetChainId][targetToken];
            if (!targetConfig.supported) revert TokenNotSupported();
        }
        
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
    function releaseEscrow(bytes32 escrowId) external payable virtual nonReentrant {
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
            // Cross-chain transfer using Stargate
            _handleStargateRelease(escrowId, escrow);
        } else if (escrow.depositToken != escrow.targetToken) {
            // Same-chain token swap using Uniswap
            _handleSameChainSwap(escrowId, escrow);
        } else {
            // Direct transfer (same token, same chain)
            _handleDirectTransfer(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle direct transfer (same token, same chain)
     */
    function _handleDirectTransfer(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        if (escrow.depositToken == address(0)) {
            // ETH transfer
            (bool success, ) = escrow.seller.call{value: escrow.netAmount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 transfer
            IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
        }
        
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.depositToken,
            escrow.netAmount,
            "direct"
        );
    }
    
    /**
     * @notice Handle same-chain token swap using Uniswap
     */
    function _handleSameChainSwap(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint256 amountOut;
        address[] memory path = new address[](2);
        
        if (escrow.depositToken == address(0)) {
            // ETH to ERC20
            path[0] = address(WETH);
            path[1] = escrow.targetToken;
            
            // Get expected output
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: escrow.netAmount}(
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
            
        } else if (escrow.targetToken == address(0)) {
            // ERC20 to ETH
            path[0] = escrow.depositToken;
            path[1] = address(WETH);
            
            // Approve and get expected output
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForETH(
                escrow.netAmount,
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
            
        } else {
            // ERC20 to ERC20
            path[0] = escrow.depositToken;
            path[1] = escrow.targetToken;
            
            // Approve and get expected output
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                escrow.netAmount,
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
        }
        
        emit TokenSwapped(escrowId, escrow.depositToken, escrow.targetToken, escrow.netAmount, amountOut);
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, amountOut, "uniswap");
    }
    
    /**
     * @notice Handle cross-chain release via Stargate
     */
    function _handleStargateRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint16 stargateChainId = chainIdToStargateId[escrow.targetChainId];
        require(stargateChainId != 0, "Stargate not configured for target chain");
        
        // Check if source and target tokens are supported by Stargate
        TokenConfig memory sourceTokenConfig = tokenConfigs[block.chainid][escrow.depositToken];
        TokenConfig memory targetTokenConfig = tokenConfigs[escrow.targetChainId][escrow.targetToken];
        
        // Ensure target token is supported
        if (!targetTokenConfig.supported) revert TokenNotSupported();
        
        // If source token is not supported, convert to a supported token first
        if (!sourceTokenConfig.supported) {
            // Find best supported token (prefer ETH for lower fees)
            if (tokenConfigs[block.chainid][address(0)].supported) {
                // Convert to ETH
                _convertAndTransferViaStargate(escrowId, escrow, address(0), stargateChainId);
            } else if (tokenConfigs[block.chainid][0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590].supported) {
                // Convert to USDC (testnet address)
                _convertAndTransferViaStargate(escrowId, escrow, 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590, stargateChainId);
            } else {
                revert TokenNotSupported();
            }
        } else {
            // Direct Stargate transfer
            if (sourceTokenConfig.isNative) {
                _handleETHStargateTransfer(escrowId, escrow, stargateChainId);
            } else {
                _handleERC20StargateTransfer(escrowId, escrow, stargateChainId, sourceTokenConfig);
            }
        }
    }
    
    /**
     * @notice Convert to supported token and transfer via Stargate
     */
    function _convertAndTransferViaStargate(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        address bridgeToken,
        uint16 stargateChainId
    ) internal {
        uint256 bridgeAmount = escrow.netAmount;
        
        // Convert to bridge token if needed
        if (escrow.depositToken != bridgeToken) {
            bridgeAmount = _swapToTargetToken(escrow.depositToken, bridgeToken, escrow.netAmount);
        }
        
        // Create modified escrow for the bridge transfer
        EscrowDeposit memory bridgeEscrow = escrow;
        bridgeEscrow.depositToken = bridgeToken;
        bridgeEscrow.netAmount = bridgeAmount;
        
        // Execute Stargate transfer
        if (bridgeToken == address(0)) {
            _handleETHStargateTransfer(escrowId, bridgeEscrow, stargateChainId);
        } else {
            TokenConfig memory config = tokenConfigs[block.chainid][bridgeToken];
            _handleERC20StargateTransfer(escrowId, bridgeEscrow, stargateChainId, config);
        }
    }
    
    /**
     * @notice Handle ETH transfer via Stargate RouterETH
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
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, ethAmount, "stargate-eth");
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
        
        // Get destination pool ID (same as source for same token)
        TokenConfig memory dstConfig = tokenConfigs[escrow.targetChainId][escrow.targetToken];
        uint256 dstPoolId = dstConfig.poolId;
        
        // Execute Stargate transfer
        IStargateRouter(router).swap{value: fee}(
            stargateChainId,
            tokenConfig.poolId,
            dstPoolId,
            payable(msg.sender), // refund address
            transferAmount,
            minAmount,
            lzTxParams,
            toAddress,
            "" // no payload
        );
        
        emit StargateTransferInitiated(escrowId, stargateChainId, tokenConfig.tokenAddress, transferAmount, router);
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, transferAmount, "stargate-erc20");
    }
    
    /**
     * @notice Internal function to swap tokens using Uniswap
     */
    function _swapToTargetToken(
        address fromToken,
        address toToken,
        uint256 amount
    ) internal returns (uint256) {
        address[] memory path = new address[](2);
        
        if (fromToken == address(0)) {
            // ETH to token
            path[0] = address(WETH);
            path[1] = toToken;
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: amount}(
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[1];
            
        } else if (toToken == address(0)) {
            // Token to ETH
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
            
        } else {
            // Token to token
            path[0] = fromToken;
            path[1] = toToken;
            
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        }
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
     * @notice Configure Stargate router for a chain
     */
    function setStargateRouter(uint256 chainId, address router, address routerETH) external onlyOwner {
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
     * @notice Configure token support for Stargate
     */
    function configureToken(
        uint256 chainId,
        address token,
        uint256 poolId,
        bool isNative
    ) external onlyOwner {
        tokenConfigs[chainId][token] = TokenConfig({
            tokenAddress: token,
            poolId: poolId,
            isNative: isNative,
            supported: true
        });
    }
    
    /**
     * @notice Disable token support
     */
    function disableToken(uint256 chainId, address token) external onlyOwner {
        tokenConfigs[chainId][token].supported = false;
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
     * @notice Get cross-chain quote for fee estimation
     */
    function getCrossChainQuote(
        uint256 targetChainId,
        address token,
        uint256 amount
    ) external view returns (uint256 fee, bool supported) {
        uint16 stargateChainId = chainIdToStargateId[targetChainId];
        if (stargateChainId == 0) return (0, false);
        
        TokenConfig memory config = tokenConfigs[block.chainid][token];
        if (!config.supported) return (0, false);
        
        if (config.isNative) {
            address routerETH = stargateRouterETHs[block.chainid];
            if (routerETH == address(0)) return (0, false);
            
            try IStargateRouterETH(routerETH).quoteLayerZeroFee(
                stargateChainId,
                abi.encodePacked(address(this)),
                IStargateRouter.lzTxObj(0, 0, "")
            ) returns (uint256 nativeFee, uint256) {
                return (nativeFee, true);
            } catch {
                return (0, false);
            }
        } else {
            address router = stargateRouters[block.chainid];
            if (router == address(0)) return (0, false);
            
            try IStargateRouter(router).quoteLayerZeroFee(
                stargateChainId,
                1,
                abi.encodePacked(address(this)),
                "",
                IStargateRouter.lzTxObj(0, 0, "")
            ) returns (uint256 nativeFee, uint256) {
                return (nativeFee, true);
            } catch {
                return (0, false);
            }
        }
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
    
    // Receive ETH
    receive() external payable {}
}