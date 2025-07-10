// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IUniswapV2Router.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint) external;
    function balanceOf(address) external view returns (uint);
    function transfer(address, uint) external returns (bool);
}

contract MockUniswapV2Router is IUniswapV2Router {
    address public immutable WETH;
    uint256 public constant MOCK_RATE = 2000; // 1 ETH = 2000 tokens
    
    constructor(address _weth) {
        WETH = _weth;
    }
    
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable override returns (uint[] memory amounts) {
        require(path[0] == WETH, "First token must be WETH");
        require(deadline >= block.timestamp, "Expired");
        
        // Convert ETH to WETH
        IWETH(WETH).deposit{value: msg.value}();
        
        // Calculate output (1 ETH = 2000 tokens)
        // Adjust for token decimals
        uint8 decimals = 18;
        try IERC20Metadata(path[path.length - 1]).decimals() returns (uint8 d) {
            decimals = d;
        } catch {}
        
        uint256 amountOut;
        if (decimals == 6) {
            // For USDC (6 decimals): 1 ETH = 2000 USDC
            amountOut = (msg.value * MOCK_RATE * 1e6) / 1e18;
        } else {
            // For 18 decimal tokens
            amountOut = (msg.value * MOCK_RATE);
        }
        
        // Apply 0.3% fee
        amountOut = (amountOut * 997) / 1000;
        
        require(amountOut >= amountOutMin, "Insufficient output");
        
        // Transfer tokens to recipient
        IERC20(path[path.length - 1]).transfer(to, amountOut);
        
        amounts = new uint[](path.length);
        amounts[0] = msg.value;
        amounts[amounts.length - 1] = amountOut;
    }
    
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        require(path[path.length - 1] == WETH, "Last token must be WETH");
        require(deadline >= block.timestamp, "Expired");
        
        // Transfer tokens from sender
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // Calculate output (2000 tokens = 1 ETH)
        // Adjust for token decimals
        uint8 decimals = 18;
        try IERC20Metadata(path[0]).decimals() returns (uint8 d) {
            decimals = d;
        } catch {}
        
        uint256 amountOut;
        if (decimals == 6) {
            // For USDC (6 decimals): 2000 USDC = 1 ETH
            amountOut = (amountIn * 1e18) / (MOCK_RATE * 1e6);
        } else {
            // For 18 decimal tokens: 2000 tokens = 1 ETH
            amountOut = (amountIn * 1e18) / MOCK_RATE;
        }
        
        // Apply 0.3% fee
        amountOut = (amountOut * 997) / 1000;
        
        require(amountOut >= amountOutMin, "Insufficient output");
        
        // Send ETH to recipient
        payable(to).transfer(amountOut);
        
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = amountOut;
    }
    
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        require(deadline >= block.timestamp, "Expired");
        
        // Transfer tokens from sender
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // Simple 1:1 swap with 0.3% fee for testing
        uint256 amountOut = (amountIn * 997) / 1000;
        
        require(amountOut >= amountOutMin, "Insufficient output");
        
        // Transfer tokens to recipient
        IERC20(path[path.length - 1]).transfer(to, amountOut);
        
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = amountOut;
    }
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view override returns (uint[] memory amounts) {
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        
        if (path[0] == WETH) {
            // ETH to token
            uint8 decimals = 18;
            try IERC20Metadata(path[path.length - 1]).decimals() returns (uint8 d) {
                decimals = d;
            } catch {}
            
            if (decimals == 6) {
                amounts[path.length - 1] = (amountIn * MOCK_RATE * 1e6 * 997) / (1e18 * 1000);
            } else {
                amounts[path.length - 1] = (amountIn * MOCK_RATE * 997) / 1000;
            }
        } else if (path[path.length - 1] == WETH) {
            // Token to ETH
            uint8 decimals = 18;
            try IERC20Metadata(path[0]).decimals() returns (uint8 d) {
                decimals = d;
            } catch {}
            
            if (decimals == 6) {
                amounts[path.length - 1] = (amountIn * 1e18 * 997) / (MOCK_RATE * 1e6 * 1000);
            } else {
                amounts[path.length - 1] = (amountIn * 1e18 * 997) / (MOCK_RATE * 1000);
            }
        } else {
            // Token to token (1:1 with fee)
            amounts[path.length - 1] = (amountIn * 997) / 1000;
        }
    }
    
    // Add some test tokens for the router
    function addTestTokens(address token, uint256 amount) external {
        // Mint tokens to this contract for swaps
        MockERC20(token).mint(address(this), amount);
    }
    
    receive() external payable {}
}

interface MockERC20 {
    function mint(address, uint256) external;
}