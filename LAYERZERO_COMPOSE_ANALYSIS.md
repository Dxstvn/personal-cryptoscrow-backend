# LayerZero V2 Compose Functionality Analysis

## Overview

LayerZero V2's compose functionality provides a powerful mechanism for executing complex cross-chain operations by allowing contracts to perform additional actions after receiving tokens on the destination chain. This is particularly useful for implementing automatic token swaps within an escrow service.

## 1. What is LayerZero's Compose/Composable Messaging Feature?

### Definition
- **Compose** is a design pattern that enables "horizontal composability" where external calls are containerized as separate message packets
- Allows multi-step cross-chain interactions by breaking complex transactions into discrete, independent steps
- Enables OApps (Omnichain Applications) to define additional logic that executes after the primary cross-chain message is received

### Key Benefits
- **Atomic Operations**: Bridge and swap tokens in a single LayerZero transaction
- **Security Isolation**: Each composed call is isolated, preventing reentrancy and limiting attack surfaces
- **Flexibility**: Support for complex DeFi strategies and multi-step operations
- **Universal Semantics**: Works consistently across all blockchain architectures

## 2. How Does lzCompose Work Technically?

### Execution Flow
```
1. Source Chain: _lzSend() → sends cross-chain message
2. Destination Chain: lzReceive() → receives message and credits tokens
3. Destination Chain: sendCompose() → queues composed message
4. Destination Chain: lzCompose() → executes composed logic (e.g., swap)
```

### Technical Components

#### Message Structure
```solidity
SendParam memory sendParam = SendParam({
    dstEid: dstEid,                              // Destination endpoint ID
    to: addressToBytes32(composerAddress),        // Composer contract address
    amountLD: tokensToSend,                      // Amount in local decimals
    minAmountLD: tokensToSend * 95 / 100,        // Min amount with slippage
    extraOptions: extraOptions,                   // Gas options
    composeMsg: abi.encode(recipient, swapData), // Composed message data
    oftCmd: ""                                   // OFT command (empty for standard)
});
```

#### Composer Interface
```solidity
interface IOAppComposer {
    function lzCompose(
        address _oApp,        // OApp that sent the message
        bytes32 _guid,        // Unique message identifier
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable;
}
```

## 3. Can It Trigger Contract Calls (Like Uniswap Swaps) on Destination Chain?

**Yes, absolutely!** The compose functionality is specifically designed for this purpose.

### Supported Operations
- **DEX Swaps**: Integrate with Uniswap, SushiSwap, or any DEX
- **Lending/Borrowing**: Deposit into Aave, Compound, etc.
- **Liquidity Provision**: Add liquidity to AMM pools
- **Staking**: Stake tokens in protocols
- **Complex DeFi Strategies**: Chain multiple DeFi operations

### Example: Automatic WETH to Token Swap
```solidity
contract TokenSwapComposer is IOAppComposer {
    ISwapRouter public immutable swapRouter; // Uniswap V3 Router
    
    function lzCompose(
        address _oApp,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable override {
        // Validate caller
        require(msg.sender == endpoint, "Only endpoint");
        require(_oApp == trustedOFT, "Only trusted OFT");
        
        // Decode message
        (address recipient, address targetToken, uint256 minOut) = 
            abi.decode(OFTComposeMsgCodec.composeMsg(_message), 
                      (address, address, uint256));
        
        // Get amount received
        uint256 amountWETH = OFTComposeMsgCodec.amountLD(_message);
        
        // Approve router
        IERC20(WETH).approve(address(swapRouter), amountWETH);
        
        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = 
            ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: targetToken,
                fee: 3000, // 0.3% fee tier
                recipient: recipient,
                deadline: block.timestamp,
                amountIn: amountWETH,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            });
            
        uint256 amountOut = swapRouter.exactInputSingle(params);
        
        emit TokenSwapped(recipient, WETH, targetToken, amountWETH, amountOut);
    }
}
```

## 4. Implementation Requirements and Examples

### Requirements

1. **OFT/OFTAdapter Contract**: Must support compose messages
2. **Composer Contract**: Implements IOAppComposer interface
3. **Gas Configuration**: Must allocate gas for both lzReceive and lzCompose
4. **Trust Setup**: Configure trusted remotes between chains

### Full Implementation Example

```solidity
// 1. Enhanced OFT with Compose Support
contract WETHOFTWithCompose is OFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) {}
    
    // Override to support compose
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        // Standard OFT receive
        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
        
        // Check if there's a compose message
        if (_message.length > 0) {
            // Compose message will be handled by endpoint
            // No additional logic needed here
        }
    }
}

// 2. Swap Composer Contract
contract EscrowSwapComposer is IOAppComposer, Ownable {
    ISwapRouter public immutable uniswapRouter;
    address public immutable WETH;
    address public immutable endpoint;
    address public immutable trustedOFT;
    
    mapping(address => bool) public allowedTokens;
    
    constructor(
        address _endpoint,
        address _trustedOFT,
        address _weth,
        address _uniswapRouter
    ) {
        endpoint = _endpoint;
        trustedOFT = _trustedOFT;
        WETH = _weth;
        uniswapRouter = ISwapRouter(_uniswapRouter);
    }
    
    function lzCompose(
        address _oApp,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable override {
        require(msg.sender == endpoint, "Only endpoint");
        require(_oApp == trustedOFT, "Only trusted OFT");
        
        // Decode the composed message
        bytes memory composeMsg = OFTComposeMsgCodec.composeMsg(_message);
        (
            address finalRecipient,
            address targetToken,
            uint256 minAmountOut,
            bytes memory swapData
        ) = abi.decode(composeMsg, (address, address, uint256, bytes));
        
        // Get the amount of WETH received
        uint256 amountWETH = OFTComposeMsgCodec.amountLD(_message);
        
        // Validate target token
        require(allowedTokens[targetToken], "Token not allowed");
        
        // Execute swap
        uint256 amountOut = _executeSwap(
            WETH,
            targetToken,
            amountWETH,
            minAmountOut,
            finalRecipient,
            swapData
        );
        
        emit SwapExecuted(_guid, finalRecipient, targetToken, amountOut);
    }
    
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes memory swapData
    ) internal returns (uint256) {
        // Approve router
        IERC20(tokenIn).approve(address(uniswapRouter), amountIn);
        
        // Decode swap path if multi-hop
        if (swapData.length > 0) {
            // Multi-hop swap
            bytes memory path = swapData;
            
            ISwapRouter.ExactInputParams memory params = 
                ISwapRouter.ExactInputParams({
                    path: path,
                    recipient: recipient,
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: minAmountOut
                });
                
            return uniswapRouter.exactInput(params);
        } else {
            // Single hop swap
            ISwapRouter.ExactInputSingleParams memory params = 
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: 3000, // 0.3% pool
                    recipient: recipient,
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: minAmountOut,
                    sqrtPriceLimitX96: 0
                });
                
            return uniswapRouter.exactInputSingle(params);
        }
    }
}

// 3. Sending with Compose
function sendWETHWithSwap(
    uint32 dstEid,
    address composerAddress,
    address finalRecipient,
    address targetToken,
    uint256 amount,
    uint256 minTargetAmount
) external payable {
    // Prepare compose message
    bytes memory composeMsg = abi.encode(
        finalRecipient,
        targetToken,
        minTargetAmount,
        "" // Empty for single-hop swap
    );
    
    // Configure gas for compose execution
    bytes memory options = OptionsBuilder.newOptions()
        .addExecutorLzReceiveOption(200000, 0) // Gas for lzReceive
        .addExecutorLzComposeOption(0, 300000, 0); // Gas for lzCompose
    
    // Prepare send parameters
    SendParam memory sendParam = SendParam({
        dstEid: dstEid,
        to: bytes32(uint256(uint160(composerAddress))),
        amountLD: amount,
        minAmountLD: amount * 95 / 100, // 5% slippage for bridge
        extraOptions: options,
        composeMsg: composeMsg,
        oftCmd: ""
    });
    
    // Quote fee
    MessagingFee memory fee = oft.quoteSend(sendParam, false);
    
    // Send with compose
    oft.send{value: fee.nativeFee}(sendParam, fee, msg.sender);
}
```

## 5. Limitations and Gas Considerations

### Limitations

1. **Gas Limits**: Composed calls are subject to block gas limits
2. **Complexity**: Each additional step increases complexity and potential failure points
3. **Atomicity**: While the bridge + initial receive is atomic, compose execution can fail independently
4. **Cross-Chain Timing**: Compose executes after the primary message, not simultaneously

### Gas Considerations

1. **Dual Gas Requirements**:
   - Gas for `lzReceive` (token credit)
   - Gas for `lzCompose` (swap execution)

2. **Gas Configuration Example**:
```solidity
// Configure options with gas for both operations
bytes memory options = OptionsBuilder.newOptions()
    .addExecutorLzReceiveOption(100000, 0)      // 100k gas for receive
    .addExecutorLzComposeOption(0, 500000, 0);  // 500k gas for compose/swap
```

3. **Gas Estimation**:
   - Simple token transfer: ~100k gas
   - Uniswap V3 single swap: ~200-300k gas
   - Multi-hop swap: ~400-600k gas
   - Complex DeFi operations: ~500k-1M gas

4. **Cost Optimization**:
   - Use efficient swap routes
   - Batch operations when possible
   - Monitor gas prices across chains

## 6. How This Works for Escrow Service (WETH → Target Token)

### Escrow Flow with Compose

1. **Buyer Initiates**: Sends payment in any token on source chain
2. **Convert to WETH**: Escrow converts to WETH (if needed)
3. **Bridge with Compose**: Send WETH cross-chain with compose message
4. **Automatic Swap**: Composer swaps WETH to seller's desired token
5. **Direct Delivery**: Target token sent directly to seller

### Benefits for Escrow

1. **Single Transaction**: Entire flow happens in one LayerZero message
2. **No Intermediate Custody**: Tokens go directly to final form
3. **Reduced Slippage**: Swap happens immediately on arrival
4. **Gas Efficiency**: One cross-chain message instead of two
5. **Better UX**: Seller receives desired token automatically

### Implementation Considerations

1. **Whitelist Tokens**: Only allow swaps to verified tokens
2. **Slippage Protection**: Set reasonable minAmountOut
3. **Fallback Mechanism**: Handle failed swaps gracefully
4. **Price Feeds**: Use oracles for better slippage calculation
5. **Multi-Route Support**: Support multiple DEXs for better rates

### Example Escrow Integration

```solidity
contract PropertyEscrowWithCompose {
    function releaseFundsWithSwap(
        uint256 escrowId,
        address targetToken,
        uint256 minTargetAmount
    ) external {
        Escrow memory escrow = escrows[escrowId];
        require(msg.sender == escrow.buyer, "Only buyer");
        require(escrow.status == Status.Funded, "Invalid status");
        
        // Prepare compose message for swap
        bytes memory composeMsg = abi.encode(
            escrow.seller,      // Final recipient
            targetToken,        // Token seller wants
            minTargetAmount,    // Minimum acceptable amount
            _getOptimalSwapPath(WETH, targetToken) // Swap route
        );
        
        // Send WETH with compose to swap
        _sendWithCompose(
            escrow.amount,
            escrow.destChainId,
            swapComposerAddress,
            composeMsg
        );
        
        escrow.status = Status.Released;
        emit FundsReleasedWithSwap(escrowId, targetToken);
    }
}
```

## Conclusion

LayerZero V2's compose functionality is perfectly suited for implementing automatic token swaps in an escrow service. It provides a secure, efficient, and user-friendly way to bridge WETH and automatically swap it to the seller's desired token on the destination chain. The pattern reduces transaction complexity, improves gas efficiency, and enhances the user experience by delivering the exact tokens the seller wants in a single atomic operation.

### Key Takeaways

1. **Yes**, compose can trigger Uniswap swaps on the destination chain
2. **Implementation** is straightforward with proper composer contracts
3. **Gas costs** are reasonable (200-500k for most swaps)
4. **Security** is enhanced through isolation and atomicity
5. **Perfect fit** for escrow services needing cross-chain token conversion

The compose pattern transforms complex multi-step cross-chain operations into elegant, single-transaction flows that significantly improve the escrow experience for both buyers and sellers.