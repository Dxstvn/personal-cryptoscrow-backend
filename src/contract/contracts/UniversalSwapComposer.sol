// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { IOAppComposer } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppComposer.sol";
import { Origin } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroReceiver.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
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
 * @title UniversalSwapComposer
 * @notice LayerZero composer that automatically swaps WETH to target tokens upon receiving cross-chain transfers
 * @dev Implements IOAppComposer to handle compose messages from OFT transfers
 */
contract UniversalSwapComposer is OApp, IOAppComposer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State variables
    IWETH public immutable WETH;
    IUniswapV2Router public immutable uniswapRouter;
    uint256 public maxSlippageBps = 500; // 5% default
    uint256 public constant MAX_BPS = 10000;
    
    // Authorized OFT adapters that can send compose messages
    mapping(address => bool) public authorizedOFTAdapters;
    
    // Events
    event TokenSwapped(
        address indexed recipient,
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event ETHUnwrapped(
        address indexed recipient,
        uint256 amount
    );
    
    event ComposerExecuted(
        address indexed from,
        bytes32 guid,
        address recipient,
        address targetToken,
        uint256 amount
    );
    
    event OFTAdapterAuthorized(address indexed oftAdapter, bool authorized);
    
    // Errors
    error UnauthorizedOFTAdapter();
    error InvalidRecipient();
    error InvalidAmount();
    error SwapFailed();
    error ETHTransferFailed();
    
    constructor(
        address _endpoint,
        address _delegate,
        address _weth,
        address _uniswapRouter
    ) OApp(_endpoint, _delegate) Ownable(_delegate) {
        WETH = IWETH(_weth);
        uniswapRouter = IUniswapV2Router(_uniswapRouter);
    }
    
    /**
     * @notice Compose receiver function called by LayerZero endpoint
     * @param _from The address that sent the compose message
     * @param _guid The global unique identifier of the message
     * @param _message The encoded swap instructions
     * @param _executor The executor address
     * @param _extraData Any extra data
     */
    function lzCompose(
        address _from,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable override {
        // Only the endpoint can call this
        require(msg.sender == address(endpoint), "Only endpoint");
        
        // Verify the sender is an authorized OFT adapter
        if (!authorizedOFTAdapters[_from]) revert UnauthorizedOFTAdapter();
        
        // Decode the compose message
        // Format: abi.encode(recipient, targetToken, amount, minAmountOut, deadline)
        (
            address recipient,
            address targetToken,
            uint256 amount,
            uint256 minAmountOut,
            uint32 deadline
        ) = abi.decode(_message, (address, address, uint256, uint256, uint32));
        
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        
        // Check WETH balance (should have been transferred to this contract)
        uint256 wethBalance = WETH.balanceOf(address(this));
        require(wethBalance >= amount, "Insufficient WETH balance");
        
        // Execute the swap or unwrap based on target token
        if (targetToken == address(0)) {
            // Target is ETH - unwrap WETH
            _unwrapWETH(recipient, amount);
        } else if (targetToken == address(WETH)) {
            // Target is WETH - just transfer
            IERC20(address(WETH)).safeTransfer(recipient, amount);
        } else {
            // Target is another token - swap via Uniswap
            _swapWETHToToken(recipient, targetToken, amount, minAmountOut, deadline);
        }
        
        emit ComposerExecuted(_from, _guid, recipient, targetToken, amount);
    }
    
    /**
     * @notice Unwrap WETH to ETH and send to recipient
     */
    function _unwrapWETH(address recipient, uint256 amount) internal {
        WETH.withdraw(amount);
        
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert ETHTransferFailed();
        
        emit ETHUnwrapped(recipient, amount);
    }
    
    /**
     * @notice Swap WETH to target token via Uniswap
     */
    function _swapWETHToToken(
        address recipient,
        address targetToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) internal {
        // Build swap path
        address[] memory path = new address[](2);
        path[0] = address(WETH);
        path[1] = targetToken;
        
        // Approve router
        IERC20(address(WETH)).safeIncreaseAllowance(address(uniswapRouter), amountIn);
        
        // Execute swap
        try uniswapRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            recipient,
            deadline
        ) returns (uint256[] memory amounts) {
            emit TokenSwapped(recipient, address(WETH), targetToken, amountIn, amounts[1]);
        } catch {
            // If swap fails, send WETH to recipient as fallback
            IERC20(address(WETH)).safeTransfer(recipient, amountIn);
            emit TokenSwapped(recipient, address(WETH), address(WETH), amountIn, amountIn);
        }
    }
    
    /**
     * @notice Quote swap to estimate output amount
     * @param fromToken The token to swap from (usually WETH)
     * @param toToken The token to swap to
     * @param amountIn The input amount
     * @return amountOut The estimated output amount
     * @return minAmountOut The minimum output with slippage protection
     */
    function quoteSwap(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 minAmountOut) {
        if (fromToken == toToken) {
            return (amountIn, amountIn);
        }
        
        if (toToken == address(0)) {
            // ETH unwrap - 1:1
            return (amountIn, amountIn);
        }
        
        // Get Uniswap quote
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = toToken;
        
        try uniswapRouter.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            amountOut = amounts[1];
            minAmountOut = amountOut * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        } catch {
            // If quote fails, return 0
            return (0, 0);
        }
    }
    
    // Admin functions
    
    /**
     * @notice Authorize or deauthorize an OFT adapter
     */
    function setOFTAdapterAuthorization(address oftAdapter, bool authorized) external onlyOwner {
        authorizedOFTAdapters[oftAdapter] = authorized;
        emit OFTAdapterAuthorized(oftAdapter, authorized);
    }
    
    /**
     * @notice Set maximum slippage for swaps
     */
    function setMaxSlippageBps(uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= MAX_BPS, "Slippage too high");
        maxSlippageBps = _maxSlippageBps;
    }
    
    /**
     * @notice Rescue stuck tokens
     */
    function rescueToken(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "ETH rescue failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
    
    // Required OApp overrides
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        // This composer only handles compose messages, not direct messages
        revert("Use lzCompose");
    }
    
    // Receive ETH from WETH unwrapping
    receive() external payable {
        require(msg.sender == address(WETH), "Only WETH");
    }
}