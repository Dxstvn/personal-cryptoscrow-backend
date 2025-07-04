// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IOFT, SendParam, MessagingFee, MessagingReceipt, OFTReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

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
 * @title UniversalEscrowServiceV3
 * @notice Enhanced escrow service with proper chain ID mapping and fixed OFT parameters
 * @dev Fixes the chain ID vs endpoint ID mismatch issue and oftCmd parameter
 */
contract UniversalEscrowServiceV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;
    
    struct EscrowDeposit {
        address buyer;
        address seller;
        address depositToken;
        uint256 depositAmount;
        uint256 netAmount;
        address targetToken;
        uint256 targetChainId;  // Now stores actual chain IDs
        bool released;
        bool conditionMet;
        uint256 timestamp;
        bytes32 transactionId;
    }
    
    // State variables
    address public serviceWallet;
    uint256 public constant SERVICE_FEE_BPS = 200; // 2%
    uint256 public constant MAX_BPS = 10000;
    uint256 public maxSlippageBps = 500; // 5% default
    
    // Chain ID mappings
    mapping(uint256 => uint32) public chainIdToEndpointId;
    mapping(uint32 => uint256) public endpointIdToChainId;
    
    // Escrow storage
    mapping(bytes32 => EscrowDeposit) public escrows;
    mapping(address => bytes32[]) public userEscrows;
    mapping(address => bool) public conditionUpdaters;
    
    // Cross-chain configuration
    mapping(uint32 => address) public oftAdapters;  // Still uses endpoint IDs for OFT
    mapping(uint32 => address) public swapComposers;
    mapping(uint32 => string) public chainNames;
    
    // External contracts
    IWETH public immutable WETH;
    IUniswapV2Router public immutable uniswapRouter;
    
    // LayerZero configuration
    uint128 public lzReceiveGas = 100000;
    uint128 public lzComposeGas = 500000;
    
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
        string method,
        bool withCompose
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
    
    event CrossChainTransferInitiated(
        bytes32 indexed escrowId,
        uint256 targetChainId,
        address oftAdapter,
        bytes32 guid,
        bool withCompose
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
        
        // Initialize chain mappings
        _initializeChainMappings();
    }
    
    /**
     * @notice Initialize chain ID to endpoint ID mappings
     */
    function _initializeChainMappings() internal {
        // Ethereum Sepolia
        chainIdToEndpointId[11155111] = 40161;
        endpointIdToChainId[40161] = 11155111;
        
        // Polygon Amoy
        chainIdToEndpointId[80002] = 40267;
        endpointIdToChainId[40267] = 80002;
        
        // Arbitrum Sepolia
        chainIdToEndpointId[421614] = 40231;
        endpointIdToChainId[40231] = 421614;
    }
    
    /**
     * @notice Add or update chain ID mapping
     */
    function setChainMapping(uint256 chainId, uint32 endpointId) external onlyOwner {
        chainIdToEndpointId[chainId] = endpointId;
        endpointIdToChainId[endpointId] = chainId;
    }
    
    /**
     * @notice Create an escrow deposit
     * @param seller Address of the seller
     * @param depositToken Token to deposit (address(0) for ETH)
     * @param depositAmount Amount to deposit
     * @param targetToken Token seller wants to receive
     * @param targetChainId Chain where seller wants to receive (actual chain ID, not LZ endpoint)
     * @return escrowId Unique escrow identifier
     */
    function createEscrow(
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId  // Now expects actual chain ID
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
            targetChainId: targetChainId,  // Stores actual chain ID
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
     * @notice Release escrow funds to seller with intelligent routing
     * @param escrowId The escrow to release
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
            // Cross-chain transfer using LayerZero
            uint32 targetEndpointId = chainIdToEndpointId[escrow.targetChainId];
            if (targetEndpointId == 0) revert InvalidChainId();
            _handleCrossChainRelease(escrowId, escrow, targetEndpointId);
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
            "direct",
            false
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
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, amountOut, "uniswap", false);
    }
    
    /**
     * @notice Handle cross-chain transfer using LayerZero
     */
    function _handleCrossChainRelease(bytes32 escrowId, EscrowDeposit memory escrow, uint32 targetEndpointId) internal {
        address oftAdapter = oftAdapters[targetEndpointId];
        if (oftAdapter == address(0)) revert InvalidChainId();
        
        // Convert to WETH if needed for cross-chain transfer
        uint256 bridgeAmount = escrow.netAmount;
        if (escrow.depositToken == address(0)) {
            WETH.deposit{value: escrow.netAmount}();
            bridgeAmount = escrow.netAmount;
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
            
            bridgeAmount = swapAmounts[1];
        }
        
        // Check if composer is available for automatic swaps
        address composer = swapComposers[targetEndpointId];
        bool useCompose = composer != address(0) && escrow.targetToken != address(WETH);
        
        bytes memory options;
        bytes memory composeMsg = "";
        
        if (useCompose) {
            // Build compose message with swap instructions
            composeMsg = abi.encode(
                escrow.seller,
                escrow.targetToken,
                bridgeAmount,
                bridgeAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS, // minAmountOut
                uint32(block.timestamp + 3600) // 1 hour deadline
            );
            
            // Build options with gas for both receive and compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(lzReceiveGas, 0)
                .addExecutorLzComposeOption(0, lzComposeGas, 0);
        } else {
            // Standard options without compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(lzReceiveGas, 0);
        }
        
        // Prepare LayerZero transfer
        bytes32 to = useCompose ? bytes32(uint256(uint160(composer))) : bytes32(uint256(uint160(escrow.seller)));
        
        SendParam memory sendParam = SendParam({
            dstEid: targetEndpointId,  // Use endpoint ID for LayerZero
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
        
        // Verify msg.value covers the fee with a small buffer for gas price fluctuations
        require(msg.value >= fee.nativeFee, "Insufficient fee");
        
        // Execute cross-chain transfer
        (MessagingReceipt memory receipt, ) = IOFT(oftAdapter).send{value: fee.nativeFee}(
            sendParam,
            fee,
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
     * @notice Configure OFT adapter for a chain
     */
    function setOFTAdapter(uint32 endpointId, address adapter, string memory chainName) external onlyOwner {
        oftAdapters[endpointId] = adapter;
        chainNames[endpointId] = chainName;
    }
    
    /**
     * @notice Configure swap composer for a chain
     */
    function setSwapComposer(uint32 endpointId, address composer) external onlyOwner {
        swapComposers[endpointId] = composer;
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
        require(_maxSlippageBps <= 1000, "Max 10% slippage"); // Max 10%
        maxSlippageBps = _maxSlippageBps;
    }
    
    /**
     * @notice Set condition updater authorization
     */
    function setConditionUpdater(address updater, bool authorized) external onlyOwner {
        conditionUpdaters[updater] = authorized;
    }
    
    /**
     * @notice Update LayerZero gas limits
     */
    function setLzGasLimits(uint128 _receiveGas, uint128 _composeGas) external onlyOwner {
        lzReceiveGas = _receiveGas;
        lzComposeGas = _composeGas;
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