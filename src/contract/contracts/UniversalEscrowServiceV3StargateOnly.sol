// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Stargate interfaces
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

interface IStargateRouterETH {
    function swapETH(
        uint16 _dstChainId,
        address payable _refundAddress,
        bytes calldata _toAddress,
        uint256 _amountLD,
        uint256 _minAmountLD
    ) external payable;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts);
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/**
 * @title UniversalEscrowServiceV3StargateOnly
 * @notice Base escrow contract with Stargate-only cross-chain functionality
 * @dev Removes LayerZero OFT entirely, uses only Stargate for cross-chain transfers
 */
contract UniversalEscrowServiceV3StargateOnly is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant SERVICE_FEE_BPS = 200; // 2%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 500; // 5%

    // Core contracts
    address public immutable serviceWallet;
    address public immutable WETH;
    address public immutable uniswapRouter;

    // Stargate configuration
    mapping(uint256 => address) public stargateRouters;
    mapping(uint256 => address) public stargateRouterETHs;
    mapping(uint256 => uint16) public chainIdToStargateId;

    // Token configuration
    struct TokenConfig {
        uint256 poolId;
        bool isNative;
        bool supported;
    }
    mapping(uint256 => mapping(address => TokenConfig)) public tokenConfigs;

    // Escrow structure
    struct EscrowDeposit {
        address buyer;
        address seller;
        address depositToken;
        uint256 depositAmount;
        uint256 netAmount; // Amount after service fee
        address targetToken;
        uint256 targetChainId;
        bool conditionMet;
        bool released;
        uint256 createdAt;
        uint256 disputeResolutionDays; // Custom dispute resolution period (1-30 days)
    }

    // Storage
    mapping(bytes32 => EscrowDeposit) public escrows;

    // Events
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address depositToken,
        uint256 depositAmount,
        uint256 netAmount,
        address targetToken,
        uint256 targetChainId
    );
    event ConditionUpdated(bytes32 indexed escrowId, bool conditionMet, address updatedBy);
    event EscrowReleased(bytes32 indexed escrowId, address releasedTo, uint256 amount);
    event EscrowCancelled(bytes32 indexed escrowId);
    event StargateRouterSet(uint256 indexed chainId, address router, address routerETH);
    event TokenConfigured(uint256 indexed chainId, address indexed token, uint256 poolId, bool isNative);
    event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 targetChainId, uint256 stargateFee);

    // Custom errors
    error InvalidAmount();
    error InvalidAddress();
    error EscrowNotFound();
    error AlreadyReleased();
    error ConditionNotMet();
    error Unauthorized();
    error InsufficientFee();
    error UnsupportedChain();
    error UnsupportedToken();
    error TransferFailed();

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        if (_serviceWallet == address(0) || _weth == address(0) || _uniswapRouter == address(0)) {
            revert InvalidAddress();
        }
        serviceWallet = _serviceWallet;
        WETH = _weth;
        uniswapRouter = _uniswapRouter;
    }

    /**
     * @notice Create a new escrow
     * @param seller The seller address
     * @param depositToken The token being deposited (address(0) for ETH)
     * @param depositAmount The amount being deposited
     * @param targetToken The target token on destination chain
     * @param targetChainId The target chain ID (0 or current chain for same-chain)
     * @param disputeResolutionDays Custom dispute resolution period in days (1-30)
     */
    function createEscrow(
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId,
        uint256 disputeResolutionDays
    ) external payable nonReentrant returns (bytes32) {
        if (seller == address(0)) revert InvalidAddress();
        if (depositAmount == 0) revert InvalidAmount();
        if (disputeResolutionDays < 1 || disputeResolutionDays > 30) revert InvalidAmount();

        // Calculate service fee
        uint256 serviceFee = (depositAmount * SERVICE_FEE_BPS) / BASIS_POINTS;
        uint256 netAmount = depositAmount - serviceFee;

        // Generate escrow ID
        bytes32 escrowId = keccak256(
            abi.encodePacked(msg.sender, seller, block.timestamp, block.number)
        );

        // Handle deposit
        if (depositToken == address(0)) {
            if (msg.value != depositAmount) revert InvalidAmount();
            // Send service fee to service wallet
            (bool sent, ) = serviceWallet.call{value: serviceFee}("");
            if (!sent) revert TransferFailed();
        } else {
            if (msg.value > 0) revert InvalidAmount();
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
            targetChainId: targetChainId == 0 ? block.chainid : targetChainId,
            conditionMet: false,
            released: false,
            createdAt: block.timestamp,
            disputeResolutionDays: disputeResolutionDays
        });

        emit EscrowCreated(
            escrowId,
            msg.sender,
            seller,
            depositToken,
            depositAmount,
            netAmount,
            targetToken,
            targetChainId
        );

        return escrowId;
    }

    /**
     * @notice Update escrow condition
     * @param escrowId The escrow to update
     * @param conditionMet Whether the condition is met
     */
    function updateCondition(bytes32 escrowId, bool conditionMet) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert AlreadyReleased();
        if (msg.sender != serviceWallet) revert Unauthorized();

        escrow.conditionMet = conditionMet;
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }

    /**
     * @notice Cancel an escrow (only buyer before condition is met)
     * @param escrowId The escrow to cancel
     */
    function cancelEscrow(bytes32 escrowId) external nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert AlreadyReleased();
        if (msg.sender != escrow.buyer) revert Unauthorized();
        if (escrow.conditionMet) revert ConditionNotMet();

        escrow.released = true;

        // Return funds to buyer
        if (escrow.depositToken == address(0)) {
            (bool sent, ) = escrow.buyer.call{value: escrow.netAmount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(escrow.depositToken).safeTransfer(escrow.buyer, escrow.netAmount);
        }

        emit EscrowCancelled(escrowId);
    }

    /**
     * @notice Handle direct transfer (same token, same chain)
     */
    function _handleDirectTransfer(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        if (escrow.depositToken == address(0)) {
            (bool sent, ) = escrow.seller.call{value: escrow.netAmount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
        }
        emit EscrowReleased(escrowId, escrow.seller, escrow.netAmount);
    }

    /**
     * @notice Handle same-chain swap
     */
    function _handleSameChainSwap(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint256 amountOut;
        
        if (escrow.depositToken == address(0)) {
            // ETH to Token
            address[] memory path = new address[](2);
            path[0] = WETH;
            path[1] = escrow.targetToken;
            
            uint256[] memory amounts = IUniswapV2Router(uniswapRouter).swapExactETHForTokens{value: escrow.netAmount}(
                0, // Accept any amount of tokens
                path,
                escrow.seller,
                block.timestamp + 300
            );
            amountOut = amounts[amounts.length - 1];
        } else if (escrow.targetToken == address(0)) {
            // Token to ETH
            IERC20(escrow.depositToken).approve(uniswapRouter, escrow.netAmount);
            
            address[] memory path = new address[](2);
            path[0] = escrow.depositToken;
            path[1] = WETH;
            
            uint256[] memory amounts = IUniswapV2Router(uniswapRouter).swapExactTokensForETH(
                escrow.netAmount,
                0, // Accept any amount of ETH
                path,
                escrow.seller,
                block.timestamp + 300
            );
            amountOut = amounts[amounts.length - 1];
        } else {
            // Token to Token
            IERC20(escrow.depositToken).approve(uniswapRouter, escrow.netAmount);
            
            address[] memory path = new address[](3);
            path[0] = escrow.depositToken;
            path[1] = WETH;
            path[2] = escrow.targetToken;
            
            uint256[] memory amounts = IUniswapV2Router(uniswapRouter).swapExactTokensForTokens(
                escrow.netAmount,
                0, // Accept any amount of tokens
                path,
                escrow.seller,
                block.timestamp + 300
            );
            amountOut = amounts[amounts.length - 1];
        }
        
        emit EscrowReleased(escrowId, escrow.seller, amountOut);
    }

    /**
     * @notice Handle Stargate cross-chain release
     */
    function _handleStargateRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint16 dstChainId = chainIdToStargateId[escrow.targetChainId];
        if (dstChainId == 0) revert UnsupportedChain();

        TokenConfig memory tokenConfig = tokenConfigs[block.chainid][escrow.depositToken];
        if (!tokenConfig.supported) revert UnsupportedToken();

        if (escrow.depositToken == address(0)) {
            // ETH transfer via StargateRouterETH
            address routerETH = stargateRouterETHs[block.chainid];
            if (routerETH == address(0)) revert UnsupportedChain();

            uint256 stargateFee = msg.value;
            if (stargateFee == 0) revert InsufficientFee();

            IStargateRouterETH(routerETH).swapETH{value: escrow.netAmount + stargateFee}(
                dstChainId,
                payable(msg.sender), // refund address
                abi.encodePacked(escrow.seller),
                escrow.netAmount,
                (escrow.netAmount * (BASIS_POINTS - DEFAULT_SLIPPAGE_BPS)) / BASIS_POINTS
            );
        } else {
            // ERC20 transfer via StargateRouter
            address router = stargateRouters[block.chainid];
            if (router == address(0)) revert UnsupportedChain();

            IERC20(escrow.depositToken).approve(router, escrow.netAmount);

            IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: bytes("")
            });

            uint256 stargateFee = msg.value;
            if (stargateFee == 0) revert InsufficientFee();

            IStargateRouter(router).swap{value: stargateFee}(
                dstChainId,
                tokenConfig.poolId,
                tokenConfig.poolId, // Same pool ID on destination
                payable(msg.sender), // refund address
                escrow.netAmount,
                (escrow.netAmount * (BASIS_POINTS - DEFAULT_SLIPPAGE_BPS)) / BASIS_POINTS,
                lzTxParams,
                abi.encodePacked(escrow.seller),
                bytes("") // No payload
            );
        }

        emit CrossChainTransferInitiated(escrowId, escrow.targetChainId, msg.value);
        emit EscrowReleased(escrowId, escrow.seller, escrow.netAmount);
    }

    /**
     * @notice Get escrow details
     */
    function getEscrowDetails(bytes32 escrowId) external view returns (
        address buyer,
        address seller,
        address depositToken,
        uint256 depositAmount,
        uint256 netAmount,
        address targetToken,
        uint256 targetChainId,
        bool conditionMet,
        bool released,
        uint256 disputeResolutionDays
    ) {
        EscrowDeposit memory escrow = escrows[escrowId];
        return (
            escrow.buyer,
            escrow.seller,
            escrow.depositToken,
            escrow.depositAmount,
            escrow.netAmount,
            escrow.targetToken,
            escrow.targetChainId,
            escrow.conditionMet,
            escrow.released,
            escrow.disputeResolutionDays
        );
    }

    /**
     * @notice Configure Stargate router for a chain
     */
    function setStargateRouter(uint256 chainId, address router, address routerETH) external onlyOwner {
        stargateRouters[chainId] = router;
        stargateRouterETHs[chainId] = routerETH;
        emit StargateRouterSet(chainId, router, routerETH);
    }

    /**
     * @notice Set Stargate chain ID mapping
     */
    function setStargateChainId(uint256 evmChainId, uint16 stargateChainId) external onlyOwner {
        chainIdToStargateId[evmChainId] = stargateChainId;
    }

    /**
     * @notice Configure token for Stargate
     */
    function configureToken(
        uint256 chainId,
        address token,
        uint256 poolId,
        bool isNative
    ) external onlyOwner {
        tokenConfigs[chainId][token] = TokenConfig({
            poolId: poolId,
            isNative: isNative,
            supported: true
        });
        emit TokenConfigured(chainId, token, poolId, isNative);
    }

    /**
     * @notice Get Stargate quote for cross-chain transfer
     */
    function getStargateQuote(
        uint256 targetChainId,
        address token,
        uint256 amount
    ) external view returns (uint256 fee) {
        uint16 dstChainId = chainIdToStargateId[targetChainId];
        if (dstChainId == 0) revert UnsupportedChain();

        address router = stargateRouters[block.chainid];
        if (router == address(0)) revert UnsupportedChain();

        if (token == address(0)) {
            // For ETH, estimate a reasonable fee
            return 0.005 ether; // Default estimate
        } else {
            // For ERC20, query the router
            IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: bytes("")
            });

            (fee, ) = IStargateRouter(router).quoteLayerZeroFee(
                dstChainId,
                1, // function type
                abi.encodePacked(address(this)),
                bytes(""),
                lzTxParams
            );
        }
    }
}