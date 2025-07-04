// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IOAppComposer } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppComposer.sol";
import { IOAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IUniswapV3Router
 * @notice Minimal interface for Uniswap V3 Router
 */
interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    function exactInputSingle(ExactInputSingleParams calldata params) 
        external 
        payable 
        returns (uint256 amountOut);
}

/**
 * @title IUniswapV2Router
 * @notice Minimal interface for Uniswap V2 Router
 */
interface IUniswapV2Router {
    function swapExactTokensForTokens(
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
 * @title IWETH
 * @notice Interface for WETH
 */
interface IWETH is IERC20 {
    function withdraw(uint256) external;
}

/**
 * @title EscrowSwapComposer
 * @notice Handles automatic token swaps on destination chain for escrow releases
 * @dev Implements LayerZero's IOAppComposer for compose functionality
 */
contract EscrowSwapComposer is IOAppComposer, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant MAX_SLIPPAGE_BPS = 1000; // 10% max slippage
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 500; // 5% default
    uint256 public constant MAX_BPS = 10000;
    
    // State variables
    IWETH public immutable WETH;
    address public immutable endpoint;
    address public uniswapV2Router;
    address public uniswapV3Router;
    uint256 public slippageBps;
    
    // Authorized OFT adapters that can call compose
    mapping(address => bool) public authorizedCallers;
    
    // Fee tiers for Uniswap V3 (0.05%, 0.3%, 1%)
    uint24[] public v3FeeTiers = [500, 3000, 10000];
    
    // Events
    event SwapExecuted(
        address indexed recipient,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string router
    );
    
    event SwapFailed(
        address indexed recipient,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amount,
        string reason
    );
    
    event CallerAuthorized(address indexed caller, bool authorized);
    event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
    event EmergencyWithdrawal(address indexed token, uint256 amount);
    
    // Errors
    error UnauthorizedCaller();
    error InvalidConfiguration();
    error SwapFailedError(string reason);
    error InsufficientBalance();
    error SlippageExceeded();
    error InvalidRecipient();
    error InvalidAmount();
    
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert UnauthorizedCaller();
        _;
    }
    
    constructor(
        address _endpoint,
        address _weth,
        address _uniswapV2Router,
        address _uniswapV3Router
    ) Ownable(msg.sender) {
        if (_endpoint == address(0) || _weth == address(0)) {
            revert InvalidConfiguration();
        }
        
        endpoint = _endpoint;
        WETH = IWETH(_weth);
        uniswapV2Router = _uniswapV2Router;
        uniswapV3Router = _uniswapV3Router;
        slippageBps = DEFAULT_SLIPPAGE_BPS;
    }
    
    /**
     * @notice LayerZero endpoint address
     */
    function oApp() external view returns (address) {
        return endpoint;
    }
    
    /**
     * @notice Handles composed message from LayerZero
     * @param _from The OApp that sent the message
     * @param _guid The global unique identifier of the message
     * @param _message The composed message containing swap instructions
     */
    function lzCompose(
        address _from,
        bytes32 _guid,
        bytes calldata _message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) external payable override onlyAuthorized nonReentrant {
        // Decode the swap instructions
        (
            address recipient,
            address targetToken,
            uint256 amount,
            uint256 minAmountOut,
            uint32 deadline
        ) = abi.decode(_message, (address, address, uint256, uint256, uint32));
        
        // Validations
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert SwapFailedError("Deadline exceeded");
        
        // Check WETH balance
        uint256 wethBalance = WETH.balanceOf(address(this));
        if (wethBalance < amount) revert InsufficientBalance();
        
        // If target token is WETH or native ETH, just transfer
        if (targetToken == address(WETH)) {
            IERC20(address(WETH)).safeTransfer(recipient, amount);
            emit SwapExecuted(recipient, address(WETH), address(WETH), amount, amount, "direct");
            return;
        }
        
        if (targetToken == address(0)) {
            // Convert WETH to ETH
            WETH.withdraw(amount);
            (bool success, ) = payable(recipient).call{value: amount}("");
            if (!success) revert SwapFailedError("ETH transfer failed");
            emit SwapExecuted(recipient, address(WETH), address(0), amount, amount, "direct");
            return;
        }
        
        // Execute swap
        uint256 amountOut = _executeSwap(
            address(WETH),
            targetToken,
            amount,
            minAmountOut,
            recipient
        );
        
        emit SwapExecuted(
            recipient,
            address(WETH),
            targetToken,
            amount,
            amountOut,
            uniswapV3Router != address(0) ? "UniswapV3" : "UniswapV2"
        );
    }
    
    /**
     * @notice Execute token swap with fallback mechanism
     */
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) internal returns (uint256 amountOut) {
        // Try Uniswap V3 first if available
        if (uniswapV3Router != address(0)) {
            try this.tryV3Swap(tokenIn, tokenOut, amountIn, minAmountOut, recipient) returns (uint256 v3Amount) {
                return v3Amount;
            } catch {
                // V3 failed, try V2
            }
        }
        
        // Fallback to V2
        if (uniswapV2Router != address(0)) {
            return _executeV2Swap(tokenIn, tokenOut, amountIn, minAmountOut, recipient);
        }
        
        revert SwapFailedError("No available router");
    }
    
    /**
     * @notice Try Uniswap V3 swap with multiple fee tiers
     * @dev External function to enable try/catch
     */
    function tryV3Swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256) {
        if (msg.sender != address(this)) revert UnauthorizedCaller();
        
        // Approve V3 router
        IERC20(tokenIn).safeIncreaseAllowance(uniswapV3Router, amountIn);
        
        // Try each fee tier
        for (uint i = 0; i < v3FeeTiers.length; i++) {
            try IUniswapV3Router(uniswapV3Router).exactInputSingle(
                IUniswapV3Router.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: v3FeeTiers[i],
                    recipient: recipient,
                    deadline: block.timestamp + 300,
                    amountIn: amountIn,
                    amountOutMinimum: minAmountOut,
                    sqrtPriceLimitX96: 0
                })
            ) returns (uint256 amountOut) {
                // Reset allowance
                try IERC20(tokenIn).approve(uniswapV3Router, 0) {} catch {}
                return amountOut;
            } catch {
                continue;
            }
        }
        
        // Reset allowance if all tiers failed
        try IERC20(tokenIn).approve(uniswapV3Router, 0) {} catch {}
        revert SwapFailedError("V3 swap failed on all fee tiers");
    }
    
    /**
     * @notice Execute Uniswap V2 swap
     */
    function _executeV2Swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) internal returns (uint256) {
        // Build path
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // Get expected output
        uint256[] memory amounts = IUniswapV2Router(uniswapV2Router).getAmountsOut(amountIn, path);
        uint256 expectedOut = amounts[1];
        
        // Apply slippage
        uint256 minOut = (expectedOut * (MAX_BPS - slippageBps)) / MAX_BPS;
        
        // Ensure minimum amount is met
        if (minOut < minAmountOut) {
            minOut = minAmountOut;
        }
        
        // Approve and swap
        IERC20(tokenIn).safeIncreaseAllowance(uniswapV2Router, amountIn);
        
        uint256[] memory swapAmounts = IUniswapV2Router(uniswapV2Router).swapExactTokensForTokens(
            amountIn,
            minOut,
            path,
            recipient,
            block.timestamp + 300
        );
        
        return swapAmounts[1];
    }
    
    /**
     * @notice Authorize or deauthorize a caller (OFT adapter)
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }
    
    /**
     * @notice Update slippage tolerance
     */
    function setSlippage(uint256 _slippageBps) external onlyOwner {
        if (_slippageBps > MAX_SLIPPAGE_BPS) revert SlippageExceeded();
        emit SlippageUpdated(slippageBps, _slippageBps);
        slippageBps = _slippageBps;
    }
    
    /**
     * @notice Update router addresses
     */
    function setRouters(address _v2Router, address _v3Router) external onlyOwner {
        uniswapV2Router = _v2Router;
        uniswapV3Router = _v3Router;
    }
    
    /**
     * @notice Emergency withdrawal
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
        emit EmergencyWithdrawal(token, amount);
    }
    
    /**
     * @notice Receive ETH when unwrapping WETH
     */
    receive() external payable {
        // Only accept ETH from WETH contract
        require(msg.sender == address(WETH), "Only WETH");
    }
}